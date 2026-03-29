"""Тестовая БД: задаём переменные до импорта приложения."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

_tmpdir = Path(tempfile.mkdtemp())
_test_db = _tmpdir / "pytest_api.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db.as_posix()}"
os.environ["SECRET_KEY"] = "pytest-jwt-signing-secret-minimum-32-characters"

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def token_employee(client: TestClient) -> str:
    r = client.post("/api/auth/login", json={"username": "employee", "password": "employee123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def token_manager(client: TestClient) -> str:
    r = client.post("/api/auth/login", json={"username": "manager", "password": "manager123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def token_admin(client: TestClient) -> str:
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]
