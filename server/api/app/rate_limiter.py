from ipaddress import ip_address, ip_network

from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import TRUSTED_PROXY_CIDRS


TRUSTED_PROXY_NETWORKS = tuple(ip_network(cidr) for cidr in TRUSTED_PROXY_CIDRS)


def get_real_ip(request):
    peer = get_remote_address(request)
    try:
        peer_address = ip_address(peer)
    except ValueError:
        return peer

    if not any(peer_address in network for network in TRUSTED_PROXY_NETWORKS):
        return peer

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        forwarded_client = forwarded_for.split(",")[0].strip()
        try:
            return str(ip_address(forwarded_client))
        except ValueError:
            pass
    return peer


limiter = Limiter(key_func=get_real_ip)
