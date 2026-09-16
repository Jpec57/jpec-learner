"""Shared by the Alembic migration and the test DB fixture, so both stay in sync."""

LEVEL_NAMES = [
    # (level, name_en, name_fr, icon_key)
    (1, "Novice", "Novice", "seedling"),
    (2, "Apprentice", "Apprenti", "book"),
    (3, "Adept", "Adepte", "spark"),
    (4, "Specialist", "Spécialiste", "target"),
    (5, "Expert", "Expert", "medal"),
    (6, "Veteran", "Vétéran", "shield"),
    (7, "Master", "Maître", "star"),
    (8, "Grandmaster", "Grand Maître", "crown"),
    (9, "Sage", "Sage", "owl"),
    (10, "Legend", "Légende", "trophy"),
]
