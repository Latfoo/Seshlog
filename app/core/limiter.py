import os
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
)
# slowapi reads RATELIMIT_ENABLED from the environment itself and stores the raw string,
# so "false" would be truthy. We override it here with the correctly-typed boolean.
limiter.enabled = os.environ.get("RATELIMIT_ENABLED", "true").lower() != "false"
