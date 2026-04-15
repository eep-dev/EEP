import eep_middleware


def test_public_exports_available() -> None:
    assert hasattr(eep_middleware, "EEPServer")
    assert hasattr(eep_middleware, "JWTAuthAdapter")
    assert hasattr(eep_middleware, "APIKeyAuthAdapter")
    assert hasattr(eep_middleware, "InMemoryDBAdapter")
    assert hasattr(eep_middleware, "PostgresDBAdapter")
    assert hasattr(eep_middleware, "InMemoryEventBusAdapter")
    assert hasattr(eep_middleware, "RedisEventBusAdapter")
    assert hasattr(eep_middleware, "create_eep_router")
    assert hasattr(eep_middleware, "create_eep_blueprint")
    assert hasattr(eep_middleware, "get_eep_urlpatterns")
