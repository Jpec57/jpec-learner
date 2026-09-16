from app.models.image import Image
from app.schemas.card import ImageOut


def image_to_out(image: Image) -> ImageOut:
    return ImageOut.model_validate(image)
