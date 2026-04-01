from __future__ import annotations

import json
import pickle
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import settings
from app.ml.types import (
    ActiveManifest,
    ArtifactInfo,
    ArtifactStatus,
    PromoteResult,
    TrainingMetrics,
)

ACTIVE_MANIFEST_FILENAME = "active_model.json"


def artifact_dir(override: str | None = None) -> Path:
    base = Path(override or settings.ml_artifact_dir).expanduser().resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


def manifest_path(override: str | None = None) -> Path:
    return artifact_dir(override) / ACTIVE_MANIFEST_FILENAME


def save_model(payload: dict[str, Any], *, model_version: str, artifact_root: str | None = None) -> str:
    path = artifact_dir(artifact_root) / f"{model_version}.pkl"
    with path.open("wb") as fh:
        pickle.dump(payload, fh)
    return str(path)


def load_model(path: str | Path) -> dict[str, Any]:
    with Path(path).expanduser().resolve().open("rb") as fh:
        return pickle.load(fh)


def latest_artifact_path(override: str | None = None) -> str | None:
    candidates = sorted(artifact_dir(override).glob("*.pkl"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates:
        return None
    return str(candidates[0].resolve())


def _training_metrics_from_payload(payload: dict[str, Any]) -> TrainingMetrics:
    metrics_payload = payload.get("metrics") or {}
    return TrainingMetrics(
        mae=metrics_payload.get("mae"),
        rmse=metrics_payload.get("rmse"),
        train_rows=int(metrics_payload.get("train_rows") or payload.get("train_rows") or 0),
        validation_rows=int(metrics_payload.get("validation_rows") or 0),
        validation_note=metrics_payload.get("validation_note"),
        warnings=metrics_payload.get("warnings"),
        validation_risk_distribution=metrics_payload.get("validation_risk_distribution"),
    )


def _artifact_info_from_payload(
    payload: dict[str, Any],
    *,
    artifact_path_value: str,
    is_active: bool,
) -> ArtifactInfo:
    return ArtifactInfo(
        model_version=payload.get("model_version"),
        model_type=payload.get("model_type"),
        trained_at=payload.get("trained_at"),
        artifact_path=artifact_path_value,
        train_rows=payload.get("train_rows"),
        unique_employees=payload.get("unique_employees"),
        metrics=_training_metrics_from_payload(payload),
        is_active=is_active,
        load_status="ok",
        load_reason=None,
    )


def read_active_manifest(override: str | None = None) -> tuple[ActiveManifest | None, str, str]:
    path = manifest_path(override)
    if not path.exists():
        return None, "active_manifest_missing", "active model manifest not found"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        manifest = ActiveManifest(
            active_model_version=str(data["active_model_version"]),
            model_type=str(data["model_type"]),
            artifact_path=str(Path(data["artifact_path"]).expanduser().resolve()),
            promoted_at=str(data["promoted_at"]),
            promoted_by=str(data["promoted_by"]),
            note=data.get("note"),
            previous_model_version=data.get("previous_model_version"),
        )
        return manifest, "active_model_ok", "active model manifest is readable"
    except Exception as exc:
        return None, "active_manifest_broken", f"active model manifest unreadable: {exc}"


def write_active_manifest(
    *,
    model_version: str,
    model_type: str,
    artifact_path_value: str,
    promoted_by: str,
    note: str | None = None,
    previous_model_version: str | None = None,
    override: str | None = None,
) -> ActiveManifest:
    manifest = ActiveManifest(
        active_model_version=model_version,
        model_type=model_type,
        artifact_path=str(Path(artifact_path_value).expanduser().resolve()),
        promoted_at=datetime.now(UTC).isoformat(),
        promoted_by=promoted_by,
        note=note,
        previous_model_version=previous_model_version,
    )
    manifest_path(override).write_text(
        json.dumps(asdict(manifest), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def list_artifacts(override: str | None = None) -> list[ArtifactInfo]:
    status = read_artifact_status(override)
    active_path = status.artifact_path if status.resolution_source in {"active_manifest", "legacy_latest"} else None
    items: list[ArtifactInfo] = []
    for path in sorted(artifact_dir(override).glob("*.pkl"), key=lambda p: p.stat().st_mtime, reverse=True):
        artifact_path_value = str(path.resolve())
        try:
            payload = load_model(artifact_path_value)
            items.append(
                _artifact_info_from_payload(
                    payload,
                    artifact_path_value=artifact_path_value,
                    is_active=(artifact_path_value == active_path),
                )
            )
        except Exception as exc:
            items.append(
                ArtifactInfo(
                    model_version=None,
                    model_type=None,
                    trained_at=None,
                    artifact_path=artifact_path_value,
                    train_rows=None,
                    unique_employees=None,
                    metrics=None,
                    is_active=(artifact_path_value == active_path),
                    load_status="unreadable",
                    load_reason=f"artifact unreadable: {exc}",
                )
            )
    return items


def find_artifact_by_model_version(model_version: str, override: str | None = None) -> ArtifactInfo | None:
    for item in list_artifacts(override):
        if item.model_version == model_version:
            return item
    return None


def resolve_runtime_artifact(override: str | None = None) -> tuple[dict[str, Any] | None, ArtifactStatus]:
    base = artifact_dir(override)
    any_artifact_exists = any(base.glob("*.pkl"))
    manifest, manifest_status, manifest_reason = read_active_manifest(override)
    manifest_path_value = str(manifest_path(override).resolve())

    if manifest is not None:
        active_path_value = str(Path(manifest.artifact_path).expanduser().resolve())
        if not Path(active_path_value).exists():
            legacy_path = latest_artifact_path(override)
            if legacy_path:
                try:
                    payload = load_model(legacy_path)
                    return payload, ArtifactStatus(
                        artifact_exists=any_artifact_exists,
                        active_model_version=payload.get("model_version"),
                        model_type=payload.get("model_type"),
                        trained_at=payload.get("trained_at"),
                        artifact_path=legacy_path,
                        train_rows=payload.get("train_rows"),
                        unique_employees=payload.get("unique_employees"),
                        metrics=_training_metrics_from_payload(payload),
                        resolution_source="legacy_latest",
                        manifest_path=manifest_path_value,
                        last_status="active_artifact_missing",
                        last_reason=(
                            f"active manifest points to missing artifact: {active_path_value}; "
                            "using latest artifact for backward compatibility"
                        ),
                    )
                except Exception as exc:
                    return None, ArtifactStatus(
                        artifact_exists=any_artifact_exists,
                        active_model_version=None,
                        model_type=None,
                        trained_at=None,
                        artifact_path=None,
                        train_rows=None,
                        unique_employees=None,
                        metrics=None,
                        resolution_source="none",
                        manifest_path=manifest_path_value,
                        last_status="active_artifact_missing",
                        last_reason=(
                            f"active manifest points to missing artifact: {active_path_value}; "
                            f"latest artifact unreadable: {exc}"
                        ),
                    )
            return None, ArtifactStatus(
                artifact_exists=any_artifact_exists,
                active_model_version=None,
                model_type=None,
                trained_at=None,
                artifact_path=None,
                train_rows=None,
                unique_employees=None,
                metrics=None,
                resolution_source="none",
                manifest_path=manifest_path_value,
                last_status="active_artifact_missing",
                last_reason=f"active manifest points to missing artifact: {active_path_value}",
            )
        try:
            payload = load_model(active_path_value)
            return payload, ArtifactStatus(
                artifact_exists=any_artifact_exists,
                active_model_version=payload.get("model_version"),
                model_type=payload.get("model_type"),
                trained_at=payload.get("trained_at"),
                artifact_path=active_path_value,
                train_rows=payload.get("train_rows"),
                unique_employees=payload.get("unique_employees"),
                metrics=_training_metrics_from_payload(payload),
                resolution_source="active_manifest",
                manifest_path=manifest_path_value,
                last_status="active_model_ok",
                last_reason="active manifest resolved successfully",
            )
        except Exception as exc:
            legacy_path = latest_artifact_path(override)
            if legacy_path and legacy_path != active_path_value:
                try:
                    payload = load_model(legacy_path)
                    return payload, ArtifactStatus(
                        artifact_exists=any_artifact_exists,
                        active_model_version=payload.get("model_version"),
                        model_type=payload.get("model_type"),
                        trained_at=payload.get("trained_at"),
                        artifact_path=legacy_path,
                        train_rows=payload.get("train_rows"),
                        unique_employees=payload.get("unique_employees"),
                        metrics=_training_metrics_from_payload(payload),
                        resolution_source="legacy_latest",
                        manifest_path=manifest_path_value,
                        last_status="active_artifact_missing",
                        last_reason=(
                            f"active artifact unreadable: {exc}; using latest artifact for backward compatibility"
                        ),
                    )
                except Exception:
                    pass
            return None, ArtifactStatus(
                artifact_exists=any_artifact_exists,
                active_model_version=None,
                model_type=None,
                trained_at=None,
                artifact_path=None,
                train_rows=None,
                unique_employees=None,
                metrics=None,
                resolution_source="none",
                manifest_path=manifest_path_value,
                last_status="active_artifact_missing",
                last_reason=f"active artifact unreadable: {exc}",
            )

    legacy_path = latest_artifact_path(override)
    if legacy_path is not None:
        try:
            payload = load_model(legacy_path)
            return payload, ArtifactStatus(
                artifact_exists=True,
                active_model_version=payload.get("model_version"),
                model_type=payload.get("model_type"),
                trained_at=payload.get("trained_at"),
                artifact_path=legacy_path,
                train_rows=payload.get("train_rows"),
                unique_employees=payload.get("unique_employees"),
                metrics=_training_metrics_from_payload(payload),
                resolution_source="legacy_latest",
                manifest_path=manifest_path_value,
                last_status=manifest_status,
                last_reason=f"{manifest_reason}; using latest artifact for backward compatibility",
            )
        except Exception as exc:
            return None, ArtifactStatus(
                artifact_exists=True,
                active_model_version=None,
                model_type=None,
                trained_at=None,
                artifact_path=None,
                train_rows=None,
                unique_employees=None,
                metrics=None,
                resolution_source="none",
                manifest_path=manifest_path_value,
                last_status=manifest_status,
                last_reason=f"{manifest_reason}; latest artifact unreadable: {exc}",
            )

    terminal_status = manifest_status if manifest_status != "active_manifest_missing" else "no_active_model"
    terminal_reason = (
        manifest_reason
        if terminal_status != "no_active_model"
        else "no active model and no readable artifacts available"
    )
    return None, ArtifactStatus(
        artifact_exists=False,
        active_model_version=None,
        model_type=None,
        trained_at=None,
        artifact_path=None,
        train_rows=None,
        unique_employees=None,
        metrics=None,
        resolution_source="none",
        manifest_path=manifest_path_value,
        last_status=terminal_status,
        last_reason=terminal_reason,
    )


def read_artifact_status(override: str | None = None) -> ArtifactStatus:
    _, status = resolve_runtime_artifact(override)
    return status
