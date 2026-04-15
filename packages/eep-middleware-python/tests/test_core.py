import pytest

from eep_middleware.core import EEPServer


@pytest.mark.asyncio
async def test_core_manifest_entity_and_gated_resolution_paths() -> None:
    server = EEPServer(base_url="https://api.example.com/", did="did:web:example.com")
    manifest = server.manifest_payload()
    assert manifest["did"] == "did:web:example.com"
    assert manifest["layers"]["layer3_ws"] == "wss://api.example.com/eep/pulse"

    entity = server.entity_payload("u", "alice")
    assert entity["did"] == "did:web:example.com:u:alice"

    default_entity = server.entity_payload()
    assert default_entity["id"] == "default"

    denied_status, denied = await server.resolve_gated_resource("content.papers.full_text", {})
    assert denied_status == 402
    assert denied["error"] == "access_restricted"

    granted_status, granted = await server.resolve_gated_resource("content.papers.full_text", {"x-eep-proofs": '[{"type":"payment","token":"tok_valid"}]'})
    assert granted_status == 200
    assert granted["tier"] == "premium"

    public_status, public = await server.resolve_gated_resource(None, {})
    assert public_status == 200
    assert public["tier"] == "public"

    non_list_status, _ = await server.resolve_gated_resource(
        "content.papers.full_text", {"x-eep-proofs": '{"type":"payment"}'}
    )
    assert non_list_status == 402

    parse_error_status, _ = await server.resolve_gated_resource(
        "content.papers.full_text", {"x-eep-proofs": "not-json"}
    )
    assert parse_error_status == 402


@pytest.mark.asyncio
async def test_core_subscription_and_audit_paths() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")

    bad_status, bad_body = await server.create_subscription({})
    assert bad_status == 400
    assert bad_body["error"] == "invalid_request"

    created_status, created_body = await server.create_subscription(
        {
            "source_did": "did:web:agent.example",
            "delivery_method": "webhook",
            "delivery_url": "https://hook.example",
        }
    )
    assert created_status == 201
    loaded = await server.get_subscription(created_body["subscription_id"])
    assert loaded is not None
    assert (await server.get_subscription("missing")) is None

    events: list[str] = []
    await server.subscribe_to_events("subscription.*", lambda event: events.append(event.event_type))

    audit = await server.audit_payload()
    assert audit["subscriptions_count"] == 1
