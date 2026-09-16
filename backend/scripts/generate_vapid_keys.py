"""Generates a VAPID key pair for Web Push (Phase 7 notification scaffolding).

Run once per environment and store the output in .env:
    JPECLEARNER_VAPID_PUBLIC_KEY=...   (handed to the browser's PushManager.subscribe())
    JPECLEARNER_VAPID_PRIVATE_KEY=...  (used server-side to sign push messages, once a
                                         digest sender exists -- nothing reads this yet)

No new dependency: VAPID keys are a plain EC P-256 key pair, base64url-encoded per
RFC 8292, and `cryptography` is already pulled in transitively by python-jose.

Usage (from the backend container):
    docker compose exec backend python scripts/generate_vapid_keys.py
"""

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_vapid_keys() -> tuple[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()

    # Uncompressed EC point format (0x04 || X || Y), 65 bytes for P-256 -- what
    # browsers expect as the applicationServerKey for PushManager.subscribe().
    x = public_numbers.x.to_bytes(32, "big")
    y = public_numbers.y.to_bytes(32, "big")
    public_key_bytes = b"\x04" + x + y

    private_key_bytes = private_key.private_bytes(
        Encoding.DER, PrivateFormat.PKCS8, NoEncryption()
    )

    return _b64url(public_key_bytes), _b64url(private_key_bytes)


if __name__ == "__main__":
    public_key, private_key = generate_vapid_keys()
    print(f"JPECLEARNER_VAPID_PUBLIC_KEY={public_key}")
    print(f"JPECLEARNER_VAPID_PRIVATE_KEY={private_key}")
