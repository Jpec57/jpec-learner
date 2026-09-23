from pydantic import BaseModel


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


class VapidPublicKeyOut(BaseModel):
    public_key: str
