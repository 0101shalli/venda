"""Mobile money payment gateways.

Provides:
  * AES-256-GCM encryption helpers so api_key / webhook_secret are never stored
    in plaintext.
  * Thin provider adapters (Fapshi, Moala, MTN MoMo Direct, Bank Transfer) that
    map the store's payment flow onto each provider's HTTP API.

Every adapter exposes:
  initiate(cfg, phone, amount, reference, currency, note, operator=None) -> dict
  status(cfg, provider_transaction_id) -> dict

Adapters that can host a checkout page also expose:
  create_payment_link(cfg, amount, reference, currency, note) -> dict

and raises PaymentError with a cashier-readable message on failure.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:  # pragma: no cover - surfaced clearly at call time
    AESGCM = None

try:
    from .database import get_data_directory
except (ImportError, SystemError):  # pragma: no cover
    from database import get_data_directory


CIPHER_PREFIX = "enc:v1:"
_PBKDF2_ROUNDS = 200_000
_HTTP_TIMEOUT = 30


# ---------------------------------------------------------------------------
# Symmetric encryption for secrets at rest
# ---------------------------------------------------------------------------

class EncryptionUnavailable(RuntimeError):
    """Raised when the `cryptography` package is not installed."""


_KEY_CACHE: bytes | None = None


def _key_file_path() -> str:
    return str(get_data_directory() / "encryption.key")


def _load_master_secret() -> bytes:
    env = os.getenv("STORE_ENCRYPTION_KEY", "").strip()
    if env:
        return env.encode("utf-8")
    path = _key_file_path()
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as fh:
            stored = fh.read().strip()
        if stored:
            return stored.encode("utf-8")
    generated = base64.b64encode(os.urandom(32)).decode("ascii")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(generated)
    return generated.encode("utf-8")


def _encryption_key() -> bytes:
    """32-byte AES key derived from the install master secret."""
    global _KEY_CACHE
    if _KEY_CACHE is not None:
        return _KEY_CACHE
    master = _load_master_secret()
    salt = hashlib.sha256(b"venda.payment_gateways.salt.v1").digest()
    _KEY_CACHE = hashlib.pbkdf2_hmac("sha256", master, salt, _PBKDF2_ROUNDS, dklen=32)
    return _KEY_CACHE


def encrypt_secret(plaintext: str | None) -> str | None:
    """AES-256-GCM encrypt a secret for storage."""
    if plaintext is None or plaintext == "":
        return None
    if AESGCM is None:
        raise EncryptionUnavailable(
            "The 'cryptography' package is required to store payment credentials. "
            "Run: pip install -r requirements.txt"
        )
    nonce = os.urandom(12)
    blob = AESGCM(_encryption_key()).encrypt(nonce, plaintext.encode("utf-8"), None)
    return CIPHER_PREFIX + base64.urlsafe_b64encode(nonce + blob).decode("ascii")


def decrypt_secret(ciphertext: str | None) -> str | None:
    """Decrypt a value produced by encrypt_secret(). Returns None for blanks."""
    if not ciphertext:
        return None
    if not ciphertext.startswith(CIPHER_PREFIX):
        # Tolerate legacy/plaintext rows so an existing DB still works.
        return ciphertext
    if AESGCM is None:
        raise EncryptionUnavailable(
            "The 'cryptography' package is required to read payment credentials. "
            "Run: pip install -r requirements.txt"
        )
    raw = base64.urlsafe_b64decode(ciphertext[len(CIPHER_PREFIX):].encode("ascii"))
    plaintext = AESGCM(_encryption_key()).decrypt(raw[:12], raw[12:], None)
    return plaintext.decode("utf-8")


def mask_secret(ciphertext: str | None) -> str:
    """Render a stored secret as a non-reversible hint for the settings UI."""
    if not ciphertext:
        return ""
    if ciphertext.startswith(CIPHER_PREFIX):
        return "••••••••"
    return "••••••••"


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------

class PaymentError(Exception):
    """A payment failure the cashier can read and act on."""

    def __init__(self, message: str, *, code: str = "payment_failed", retryable: bool = True):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def _http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict | None = None,
    body: dict | None = None,
    form: dict | None = None,
) -> tuple[int, dict]:
    data = None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    elif form is not None:
        data = urllib.parse.urlencode(form).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    req = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        status = exc.code
    except urllib.error.URLError as exc:
        raise PaymentError(
            f"Could not reach the payment provider ({exc.reason}). Check your internet connection.",
            code="network_error",
        ) from exc
    except Exception as exc:  # timeouts, TLS problems, ...
        raise PaymentError(f"Payment provider request failed: {exc}", code="network_error") from exc

    if not raw.strip():
        return status, {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        return status, {"message": raw[:400]}
    if not isinstance(parsed, dict):
        return status, {"data": parsed}
    return status, parsed


def error_message_from_payload(payload: dict, fallback: str) -> str:
    for key in ("message", "reason", "error_description", "errorMessage", "statusMessage"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    nested = payload.get("error")
    if isinstance(nested, str) and nested.strip():
        return nested.strip()
    if isinstance(nested, dict):
        return error_message_from_payload(nested, fallback)
    return fallback


# ---------------------------------------------------------------------------
# Phone number handling
# ---------------------------------------------------------------------------

_MSISDN_RE = re.compile(r"\d+")


def normalize_phone(raw: str) -> str:
    """Reduce a user-entered number to digits and strip a 237 country code.

    Raises PaymentError when the number cannot be used.
    """
    digits = "".join(_MSISDN_RE.findall(raw or ""))
    if not digits:
        raise PaymentError("Enter a mobile money number.", code="invalid_phone", retryable=False)
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("237") and len(digits) == 12:
        digits = digits[3:]
    if len(digits) == 9:
        return digits
    if len(digits) < 9:
        raise PaymentError(
            "That number is too short. Enter a 9-digit number such as 677123456.",
            code="invalid_phone",
            retryable=False,
        )
    raise PaymentError(
        f"'{raw}' is not a valid Cameroon number. Use the 9-digit local format, e.g. 677123456.",
        code="invalid_phone",
        retryable=False,
    )


def detect_carrier(msisdn: str) -> str | None:
    """Best-effort operator detection from Cameroon MTN / Orange prefixes.

    MTN: 67, 650-654, 680-689. Orange: 69, 655-659, 690-699.
    """
    digits = re.sub(r"\D", "", msisdn or "")
    if digits.startswith("237") and len(digits) == 12:
        digits = digits[3:]
    if len(digits) != 9:
        return None
    prefix2 = digits[:2]
    prefix3 = int(digits[:3])
    if prefix2 == "67" or 650 <= prefix3 <= 654 or 680 <= prefix3 <= 689:
        return "MTN"
    if prefix2 == "69" or 655 <= prefix3 <= 659 or 690 <= prefix3 <= 699:
        return "Orange"
    return None


# ---------------------------------------------------------------------------
# Gateway configuration
# ---------------------------------------------------------------------------

@dataclass
class GatewayConfig:
    """A gateway row with its secrets decrypted and ready to use."""

    id: str
    name: str
    is_active: bool
    environment: str
    api_user: str | None
    api_key: str | None
    webhook_secret: str | None
    master_phone_number: str | None
    bank_name: str | None
    bank_account_number: str | None
    base_url: str | None

    @classmethod
    def from_row(cls, row) -> "GatewayConfig":
        return cls(
            id=row.id,
            name=row.gateway_name,
            is_active=bool(row.is_active),
            environment=(row.environment or "sandbox"),
            api_user=row.api_user,
            api_key=decrypt_secret(row.api_key),
            webhook_secret=decrypt_secret(row.webhook_secret),
            master_phone_number=row.master_phone_number,
            bank_name=row.bank_name,
            bank_account_number=row.bank_account_number,
            base_url=row.base_url,
        )

    def require_credentials(self) -> None:
        if not (self.api_user and self.api_key):
            raise PaymentError(
                f"{PROVIDER_LABELS.get(self.name, self.name)} is missing its API credentials. "
                "Add them in Settings → Mobile Payment Configurations.",
                code="missing_credentials",
                retryable=False,
            )


PROVIDER_LABELS = {
    "fapshi": "Fapshi",
    "moala": "Moala",
    "mtn_momo": "MTN MoMo Direct",
    "bank_transfer": "Bank Transfer",
}

PROVIDER_IDS = tuple(PROVIDER_LABELS.keys())


def base_url_for(cfg: GatewayConfig, default: str) -> str:
    return (cfg.base_url or default).rstrip("/")


def is_manual(cfg: GatewayConfig) -> bool:
    return cfg.name == "bank_transfer"


# ---------------------------------------------------------------------------
# Fapshi — https://docs.fapshi.com
# ---------------------------------------------------------------------------

class FapshiAdapter:
    SANDBOX_URL = "https://sandbox.fapshi.com"
    LIVE_URL = "https://live.fapshi.com"
    MIN_AMOUNT = 100

    name = "fapshi"
    supports_payment_link = True

    def _base(self, cfg: GatewayConfig) -> str:
        default = self.SANDBOX_URL if cfg.environment == "sandbox" else self.LIVE_URL
        return base_url_for(cfg, default)

    def _headers(self, cfg: GatewayConfig) -> dict:
        cfg.require_credentials()
        return {"apiuser": cfg.api_user, "apikey": cfg.api_key}

    def _amount_int(self, amount) -> int:
        amount_int = int(round(float(amount)))
        if amount_int < self.MIN_AMOUNT:
            raise PaymentError(
                f"Fapshi requires a minimum payment of {self.MIN_AMOUNT} XAF.",
                code="amount_too_small",
                retryable=False,
            )
        return amount_int

    def initiate(self, cfg, msisdn, amount, reference, currency, note, operator=None) -> dict:
        payload = {
            "amount": self._amount_int(amount),
            "phone": msisdn,
            "name": note or "Store payment",
            "externalId": reference[:100],
            "message": note or "Store payment",
        }
        if operator == "MTN":
            payload["medium"] = "mobile money"
        elif operator == "Orange":
            payload["medium"] = "orange money"
        status, body = _http_json(
            f"{self._base(cfg)}/direct-pay",
            method="POST",
            headers=self._headers(cfg),
            body=payload,
        )
        if status >= 400 or not body.get("transId"):
            raise PaymentError(
                error_message_from_payload(body, "Fapshi rejected the payment request."),
                code="initiation_failed",
            )
        return {"provider_transaction_id": str(body["transId"]), "raw": body}

    def create_payment_link(self, cfg, amount, reference, currency, note) -> dict:
        payload = {
            "amount": self._amount_int(amount),
            "externalId": reference[:100],
            "message": note or "Store payment",
        }
        status, body = _http_json(
            f"{self._base(cfg)}/initiate-pay",
            method="POST",
            headers=self._headers(cfg),
            body=payload,
        )
        link = body.get("link")
        if status >= 400 or not link:
            raise PaymentError(
                error_message_from_payload(body, "Fapshi could not create a payment link."),
                code="link_failed",
            )
        return {
            "payment_link": str(link),
            "provider_transaction_id": str(body.get("transId") or reference),
            "raw": body,
        }

    def status(self, cfg, provider_transaction_id) -> dict:
        status_code, body = _http_json(
            f"{self._base(cfg)}/payment-status/{urllib.parse.quote(provider_transaction_id)}",
            headers=self._headers(cfg),
        )
        if status_code >= 400:
            raise PaymentError(
                error_message_from_payload(body, "Could not read the Fapshi transaction status."),
                code="status_failed",
            )
        return _normalize_status(
            body.get("status"),
            {
                "SUCCESSFUL": ("successful", None),
                "FAILED": ("failed", body.get("reason") or "The customer did not complete the payment."),
                "EXPIRED": ("failed", "The payment request expired before it was confirmed."),
                "PENDING": ("pending", None),
                "CREATED": ("pending", None),
            },
            reason=body.get("reason"),
        )


# ---------------------------------------------------------------------------
# MTN MoMo Direct (Collections API) — https://momodeveloper.mtn.com
# ---------------------------------------------------------------------------

class MtnMomoAdapter:
    SANDBOX_URL = "https://sandbox.momodeveloper.mtn.com/collection"
    LIVE_URL = "https://proxy.momoapi.mtn.com/collection"

    name = "mtn_momo"

    def _base(self, cfg: GatewayConfig) -> str:
        default = self.SANDBOX_URL if cfg.environment == "sandbox" else self.LIVE_URL
        return base_url_for(cfg, default)

    def _env(self, cfg: GatewayConfig) -> str:
        return "sandbox" if cfg.environment == "sandbox" else "live"

    def _currency(self, cfg: GatewayConfig, currency: str) -> str:
        # The MTN sandbox environment settles in EUR; live settles in XAF.
        return "EUR" if cfg.environment == "sandbox" else (currency or "XAF")

    def _token(self, cfg: GatewayConfig) -> str:
        cfg.require_credentials()
        basic = base64.b64encode(f"{cfg.api_user}:{cfg.api_key}".encode("utf-8")).decode("ascii")
        status, body = _http_json(
            f"{self._base(cfg)}/token/",
            method="POST",
            headers={
                "Authorization": f"Basic {basic}",
                "Ocp-Apim-Subscription-Key": cfg.api_user,
                "X-Target-Environment": self._env(cfg),
            },
        )
        token = body.get("access_token")
        if status >= 400 or not token:
            raise PaymentError(
                error_message_from_payload(body, "MTN MoMo rejected the API credentials."),
                code="auth_failed",
                retryable=False,
            )
        return token

    def initiate(self, cfg, msisdn, amount, reference, currency, note, operator=None) -> dict:
        token = self._token(cfg)
        base = self._base(cfg)
        env = self._env(cfg)
        request_id = str(uuid.uuid4())
        body = {
            "amount": f"{float(amount):.2f}",
            "currency": self._currency(cfg, currency),
            "externalId": re.sub(r"\s+", "", reference)[:100],
            "payer": {"partyIdType": "MSISDN", "partyId": msisdn},
            "payerMessage": note or "Store payment",
            "payeeNote": (cfg.master_phone_number or note or "Store payment")[:80],
        }
        status, payload = _http_json(
            f"{base}/v1_0/requesttopay",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Ocp-Apim-Subscription-Key": cfg.api_user,
                "X-Target-Environment": env,
                "X-Reference-Id": request_id,
            },
            body=body,
        )
        if status >= 400:
            raise PaymentError(
                error_message_from_payload(payload, "MTN MoMo rejected the payment request."),
                code="initiation_failed",
            )
        return {"provider_transaction_id": request_id, "raw": payload}

    def status(self, cfg, provider_transaction_id) -> dict:
        token = self._token(cfg)
        status_code, body = _http_json(
            f"{self._base(cfg)}/v1_0/requesttopay/{urllib.parse.quote(provider_transaction_id)}",
            headers={
                "Authorization": f"Bearer {token}",
                "Ocp-Apim-Subscription-Key": cfg.api_user,
                "X-Target-Environment": self._env(cfg),
                "X-Reference-Id": str(uuid.uuid4()),
            },
        )
        if status_code >= 400:
            raise PaymentError(
                error_message_from_payload(body, "Could not read the MTN MoMo transaction status."),
                code="status_failed",
            )
        reason = body.get("reason")
        return _normalize_status(
            body.get("status"),
            {
                "SUCCESSFUL": ("successful", None),
                "FAILED": ("failed", reason or "The customer declined or the payment failed."),
                "PENDING": ("pending", None),
            },
            reason=reason,
        )


# ---------------------------------------------------------------------------
# Moala — payment aggregator (Gabon / Cameroon)
# ---------------------------------------------------------------------------

class MoalaAdapter:
    SANDBOX_URL = "https://sandbox.api.moala.africa"
    LIVE_URL = "https://api.moala.africa"

    name = "moala"
    supports_payment_link = False

    def _base(self, cfg: GatewayConfig) -> str:
        default = self.SANDBOX_URL if cfg.environment == "sandbox" else self.LIVE_URL
        return base_url_for(cfg, default)

    def _headers(self, cfg: GatewayConfig, method: str, path: str, body: dict | None) -> dict:
        """Moala signs timestamp + METHOD + path + compact JSON body with HMAC-SHA256."""
        cfg.require_credentials()
        timestamp = str(int(time.time()))
        payload = json.dumps(body, separators=(",", ":")) if body is not None else ""
        message = f"{timestamp}{method}{path}{payload}"
        signature = hmac.new(
            (cfg.api_key or "").encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return {
            "LP-ACCESS-KEY": cfg.api_user or "",
            "LP-ACCESS-TIMESTAMP": timestamp,
            "LP-ACCESS-SIGN": signature,
            "Content-Type": "application/json",
        }

    def _request(self, cfg: GatewayConfig, method: str, path: str, body: dict | None = None) -> dict:
        status, payload = _http_json(
            f"{self._base(cfg)}{path}",
            method=method,
            headers=self._headers(cfg, method, path, body),
            body=body,
        )
        if status >= 400:
            raise PaymentError(
                error_message_from_payload(payload, "Moala rejected the request."),
                code="request_failed",
            )
        return payload

    @staticmethod
    def _data(payload: dict) -> dict:
        data = payload.get("data")
        return data if isinstance(data, dict) else payload

    def initiate(self, cfg, msisdn, amount, reference, currency, note, operator=None) -> dict:
        operator = operator or detect_carrier(msisdn)
        if operator == "MTN":
            service_code = "CASHIN_MTN_CM"
        elif operator == "Orange":
            service_code = "CASHIN_ORANGE_CM"
        else:
            raise PaymentError(
                "Could not detect whether this is an MTN or Orange number. "
                "Enter a valid Cameroon mobile money number (MTN 67/650-654/680-689, Orange 69/655-659/690-699).",
                code="invalid_operator",
                retryable=False,
            )
        body = {
            "transactionType": "withdrawal",
            "amount": int(round(float(amount))),
            "serviceCode": service_code,
            "phoneNumber": msisdn,
            "partnerId": reference[:100],
        }
        payload = self._request(cfg, "POST", "/v1/api/transaction/withdrawal", body)
        data = self._data(payload)
        tx_id = (
            data.get("transactionId")
            or data.get("transaction_id")
            or data.get("partnerId")
            or reference
        )
        return {"provider_transaction_id": str(tx_id), "raw": payload}

    def status(self, cfg, provider_transaction_id) -> dict:
        path = f"/v1/api/transaction/check/{urllib.parse.quote(str(provider_transaction_id))}"
        payload = self._request(cfg, "GET", path)
        data = self._data(payload)
        raw_status = (
            data.get("status")
            or data.get("transactionStatus")
            or data.get("state")
            or payload.get("status")
        )
        reason = data.get("message") or data.get("reason") or payload.get("message")
        return _normalize_status(
            raw_status,
            {
                "SUCCESSFUL": ("successful", None),
                "SUCCESS": ("successful", None),
                "COMPLETED": ("successful", None),
                "PAID": ("successful", None),
                "FAILED": ("failed", reason or "The payment failed."),
                "FAILURE": ("failed", reason or "The payment failed."),
                "CANCELLED": ("failed", "The customer cancelled the payment."),
                "REJECTED": ("failed", reason or "The payment was rejected."),
                "PENDING": ("pending", None),
                "PROCESSING": ("pending", None),
                "INITIATED": ("pending", None),
            },
            reason=reason,
        )

    def create_payment_link(self, cfg, amount, reference, currency, note) -> dict:
        raise PaymentError(
            "Moala payment links are created from the Moala portal, so a scannable QR link "
            "cannot be generated automatically. Use the mobile money number below instead.",
            code="link_unsupported",
            retryable=False,
        )


# ---------------------------------------------------------------------------
# Bank transfer — offline, confirmed by the cashier
# ---------------------------------------------------------------------------

class BankTransferAdapter:
    name = "bank_transfer"

    def initiate(self, cfg, msisdn, amount, reference, currency, note, operator=None) -> dict:
        raise PaymentError(
            "Bank transfer payments are confirmed manually. Tap 'Confirm payment received' "
            "once the money is in the store's account.",
            code="manual_confirmation",
            retryable=False,
        )

    def status(self, cfg, provider_transaction_id) -> dict:
        return {"status": "pending", "reason": None}


ADAPTERS = {
    "fapshi": FapshiAdapter,
    "mtn_momo": MtnMomoAdapter,
    "moala": MoalaAdapter,
    "bank_transfer": BankTransferAdapter,
}


def adapter_for(gateway_name: str):
    cls = ADAPTERS.get((gateway_name or "").strip().lower())
    if cls is None:
        raise PaymentError(
            f"'{gateway_name}' is not a supported payment provider.",
            code="unsupported_provider",
            retryable=False,
        )
    return cls()


def _normalize_status(raw_status, mapping: dict, *, reason: str | None = None) -> dict:
    key = str(raw_status or "").strip().upper()
    status, default_reason = mapping.get(key, ("pending", None))
    return {"status": status, "reason": reason or default_reason}


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

def verify_webhook_secret(cfg: GatewayConfig, provided: str | None) -> bool:
    """Constant-time comparison of a webhook signature against the stored secret."""
    if not cfg.webhook_secret:
        # No secret configured: accept so sandbox testing still works.
        return True
    if not provided:
        return False
    return hmac.compare_digest(str(provided), str(cfg.webhook_secret))


def parse_webhook_status(payload: dict) -> tuple[str | None, str | None]:
    """Extract (provider_transaction_id, normalized_status) from a webhook body."""
    trans_id = (
        payload.get("transId")
        or payload.get("transaction_id")
        or payload.get("transactionId")
        or payload.get("referenceId")
        or payload.get("id")
    )
    raw = payload.get("status") or payload.get("state") or payload.get("event")
    mapping = {
        "SUCCESSFUL": "successful",
        "SUCCESS": "successful",
        "COMPLETED": "successful",
        "PAID": "successful",
        "FAILED": "failed",
        "FAILURE": "failed",
        "CANCELLED": "failed",
        "REJECTED": "failed",
        "PENDING": "pending",
        "PROCESSING": "pending",
        "INITIATED": "pending",
    }
    return (str(trans_id) if trans_id else None, mapping.get(str(raw or "").strip().upper()))