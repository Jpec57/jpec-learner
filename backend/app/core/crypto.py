import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    # Fernet requires a urlsafe-base64 32-byte key; settings.llm_key_secret can be
    # any string, so it's hashed down to a fixed-size key deterministically.
    digest = hashlib.sha256(settings.llm_key_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain_text: str) -> str:
    return _fernet().encrypt(plain_text.encode()).decode()


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored secret could not be decrypted") from exc
