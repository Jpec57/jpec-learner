from sqlalchemy.types import UserDefinedType


class LtreeType(UserDefinedType):
    """Maps to Postgres' `ltree` type, used for materialized hierarchy paths.

    Values are plain dot-separated label strings on the Python side (e.g.
    "abc123.def456"); Postgres handles ltree-specific comparisons (<@, @>, …)
    when we use those operators in raw SQL.
    """

    cache_ok = True

    def get_col_spec(self, **kw):
        return "LTREE"

    def bind_processor(self, dialect):
        def process(value):
            return value

        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            return value

        return process
