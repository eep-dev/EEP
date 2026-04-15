from eep_api_python.app import SubscriptionStore


class FakeCursor:
    def __init__(self):
        self.executed = []
        self._fetchone_value = (1,)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchone(self):
        return self._fetchone_value


class FakeConn:
    def __init__(self):
        self.cursor_obj = FakeCursor()

    def cursor(self):
        return self.cursor_obj


class FakeRedis:
    def __init__(self):
        self.messages = []

    def publish(self, channel, payload):
        self.messages.append((channel, payload))


def test_subscription_store_memory_only():
    store = SubscriptionStore()
    store.db_conn = None
    store.redis = None
    store.pg_ready = False
    store.redis_ready = False
    store.save(
        {
            "subscription_id": "sub_1",
            "source_did": "did:web:test",
            "delivery_method": "sse",
            "created_at": "2026-01-01T00:00:00Z",
        }
    )
    assert store.count() == 1
    assert store.status() == {"postgres": False, "redis": False}


def test_subscription_store_db_and_redis_paths():
    store = SubscriptionStore()
    store.db_conn = FakeConn()
    store.redis = FakeRedis()
    store.pg_ready = True
    store.redis_ready = True

    store.save(
        {
            "subscription_id": "sub_2",
            "source_did": "did:web:test",
            "delivery_method": "webhook",
            "callback_url": "https://example.com/hook",
            "created_at": "2026-01-01T00:00:00Z",
        }
    )
    # Count should come from DB branch when pg_ready=True
    assert store.count() == 1
    assert len(store.db_conn.cursor_obj.executed) >= 2
    assert len(store.redis.messages) == 1
    assert store.status() == {"postgres": True, "redis": True}
