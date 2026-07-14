from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def workflow(name: str) -> str:
    path = ROOT / ".github" / "workflows" / name
    assert path.exists(), f"missing workflow: {path}"
    return path.read_text()


def require(content: str, *needles: str) -> None:
    for needle in needles:
        assert needle in content, f"workflow is missing contract marker: {needle}"


def test_ci() -> None:
    content = workflow("ci.yml")
    require(
        content,
        "pull_request:",
        "push:",
        "branches: [main]",
        "contents: read",
        "frontend:",
        "backend:",
        "caddy:",
        "release-contracts:",
        "compose-build:",
        "npm run build",
        "lint-changed-frontend.sh",
        "docker compose up -d --wait dashboard-db",
        "pytest -q",
        "tests/caddy_contract.test.js",
        "deploy_release_contract_test.sh",
        "docker compose build",
    )


def test_test_deployment() -> None:
    content = workflow("deploy-test.yml")
    require(
        content,
        "workflow_run:",
        "workflows: [CI]",
        "github.event.workflow_run.conclusion == 'success'",
        "github.event.workflow_run.event == 'push'",
        "github.event.workflow_run.head_branch == 'main'",
        "github.event.workflow_run.head_sha",
        "environment: test",
        "group: deploy-test",
        "cancel-in-progress: false",
        "DEPLOY_SSH_PRIVATE_KEY",
        "vars.DEPLOY_HOST",
        "vars.DEPLOY_PORT",
        "vars.DEPLOY_USER",
        "vars.RELEASE_ROOT",
        "vars.SHARED_CONFIG_DIR",
        "vars.PUBLIC_HEALTH_URL",
        "deploy-release.sh test",
        "GITHUB_STEP_SUMMARY",
    )


def test_production_deployment() -> None:
    content = workflow("deploy-production.yml")
    require(
        content,
        "workflow_dispatch:",
        "sha:",
        "required: true",
        "validate-sha:",
        "merge-base --is-ancestor",
        "origin/main",
        "environment: production",
        "group: deploy-production",
        "CREATE_DB_BACKUP=true",
        "deploy-release.sh production",
        "GITHUB_STEP_SUMMARY",
    )


def test_no_embedded_credentials() -> None:
    workflow_dir = ROOT / ".github" / "workflows"
    content = "\n".join(path.read_text() for path in workflow_dir.glob("*.yml"))
    forbidden = (
        "BEGIN " + "OPENSSH PRIVATE KEY",
        "BEGIN " + "RSA PRIVATE KEY",
        "ssh-" + "password:",
    )
    for marker in forbidden:
        assert marker not in content, f"embedded credential marker found: {marker}"


if __name__ == "__main__":
    test_ci()
    test_test_deployment()
    test_production_deployment()
    test_no_embedded_credentials()
    print("all workflow contract assertions passed")
