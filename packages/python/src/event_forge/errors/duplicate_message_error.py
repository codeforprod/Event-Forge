class DuplicateMessageError(Exception):
    def __init__(self, message_id: str, source: str):
        super().__init__(f"Duplicate message: {message_id} from {source}"); self.message_id = message_id; self.source = source
