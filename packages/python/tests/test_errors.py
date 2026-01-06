import pytest
from event_forge_inbox_outbox.errors import DuplicateMessageError, ProcessingError
def test_processing_error():
    error = ProcessingError(message="Validation failed", message_id="msg-123", event_type="user.created")
    assert str(error) == "Validation failed" and error.message_id == "msg-123"
def test_duplicate_message_error():
    error = DuplicateMessageError(message_id="msg-123", source="external-system")
    assert "msg-123" in str(error) and "external-system" in str(error)
