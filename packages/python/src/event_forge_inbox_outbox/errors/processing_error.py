class ProcessingError(Exception):
    def __init__(self, message: str, message_id: str, event_type: str, cause: Exception | None = None):
        super().__init__(message); self.message_id = message_id; self.event_type = event_type; self.cause = cause
