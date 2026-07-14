from ipaddress import ip_network
from types import SimpleNamespace

from app import rate_limiter


def request(peer, forwarded_for=None):
    headers = {"X-Forwarded-For": forwarded_for} if forwarded_for else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


def test_untrusted_peer_cannot_spoof_forwarded_client(monkeypatch):
    monkeypatch.setattr(rate_limiter, "TRUSTED_PROXY_NETWORKS", ())

    assert rate_limiter.get_real_ip(request("203.0.113.10", "198.51.100.7")) == "203.0.113.10"


def test_trusted_proxy_supplies_forwarded_client(monkeypatch):
    monkeypatch.setattr(rate_limiter, "TRUSTED_PROXY_NETWORKS", (ip_network("172.16.0.0/12"),))

    assert rate_limiter.get_real_ip(request("172.20.0.4", "198.51.100.7")) == "198.51.100.7"
