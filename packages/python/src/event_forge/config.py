import os
from dataclasses import dataclass, field


def _default_worker_id() -> str:
    hostname = os.environ.get("HOSTNAME", "unknown")
    pid = os.getpid()
    return f"{hostname}-{pid}"


@dataclass
class OutboxConfig:
    """Outbox Service Configuration."""

    polling_interval: float = 1.0
    """Polling interval in seconds (default: 1.0)."""

    batch_size: int = 10
    """Batch size for fetching messages (default: 10)."""

    max_retries: int = 3
    """Maximum retry attempts (default: 3)."""

    lock_timeout_seconds: int = 300
    """Lock timeout in seconds (default: 300 = 5 minutes)."""

    backoff_base_seconds: float = 5.0
    """Exponential backoff base in seconds (default: 5)."""

    max_backoff_seconds: float = 3600.0
    """Maximum backoff time in seconds (default: 3600 = 1 hour)."""

    cleanup_interval: float = 86400.0
    """Cleanup interval for old messages in seconds (default: 86400 = 24 hours)."""

    retention_days: int = 7
    """Keep published messages for this many days (default: 7)."""

    immediate_processing: bool = True
    """Enable immediate processing on create (default: True)."""

    worker_id: str = field(default_factory=_default_worker_id)
    """Unique worker ID (default: hostname-PID)."""


@dataclass
class InboxConfig:
    """Inbox Service Configuration."""

    cleanup_interval: float = 86400.0
    """Cleanup interval for old messages in seconds (default: 86400 = 24 hours)."""

    retention_days: int = 7
    """Keep processed messages for this many days (default: 7)."""

    enable_retry: bool = False
    """Enable retry mechanism for failed messages (default: False)."""

    max_retries: int = 3
    """Maximum retry attempts (default: 3)."""

    retry_polling_interval: float = 5.0
    """Polling interval for retryable messages in seconds (default: 5.0)."""

    backoff_base_seconds: float = 5.0
    """Exponential backoff base in seconds (default: 5)."""

    max_backoff_seconds: float = 3600.0
    """Maximum backoff time in seconds (default: 3600 = 1 hour)."""

    retry_batch_size: int = 10
    """Batch size for fetching retryable messages (default: 10)."""

    retry_worker_id: str = field(default_factory=_default_worker_id)
    """Unique worker ID for retry processing (default: hostname-PID)."""
