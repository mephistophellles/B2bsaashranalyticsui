from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True, slots=True)
class FeatureRow:
    employee_id: int
    department_id: int
    survey_date_t: date
    current_essi: float
    block1_pct: float
    block2_pct: float
    block3_pct: float
    block4_pct: float
    block5_pct: float
    prev_essi: float | None
    delta_prev: float | None
    days_since_prev_survey: int | None
    tenure_days: int | None
    dept_avg_essi_t: float | None
    dept_employee_count_t: int
    org_avg_essi_t: float | None


@dataclass(frozen=True, slots=True)
class DatasetRow(FeatureRow):
    survey_date_t1: date
    next_essi: float
    delta_next_essi: float


@dataclass(frozen=True, slots=True)
class CoverageSummary:
    total_surveys: int
    unique_employees: int
    employees_with_2plus_surveys: int
    training_pairs: int
    covered_departments: int
    pairs_by_department: dict[str, int]
    min_pairs_per_employee: int
    median_pairs_per_employee: float
    max_pairs_per_employee: int
    warnings: list[str]


@dataclass(frozen=True, slots=True)
class TrainingMetrics:
    mae: float | None
    rmse: float | None
    train_rows: int
    validation_rows: int
    validation_note: str | None = None
    warnings: list[str] | None = None
    validation_risk_distribution: dict[str, int] | None = None


@dataclass(frozen=True, slots=True)
class TrainingResult:
    status: str  # trained | skipped | failed
    reason: str
    train_rows: int
    unique_employees: int
    model_type: str
    model_version: str | None
    metrics: TrainingMetrics
    artifact_path: str | None


@dataclass(frozen=True, slots=True)
class InferenceEmployeeResult(FeatureRow):
    predicted_delta_next_essi: float
    predicted_next_essi: float
    risk_band: str  # high | medium | low


@dataclass(frozen=True, slots=True)
class InferenceRunResult:
    status: str  # success | skipped | failed
    reason: str
    model_type: str | None
    model_version: str | None
    artifact_path: str | None
    employee_results: list[InferenceEmployeeResult]
    resolution_source: str = "none"


@dataclass(frozen=True, slots=True)
class DepartmentRiskSummary:
    department_id: int
    department_name: str
    employee_count: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    high_risk_share: float
    avg_predicted_delta: float
    weakest_block_indices: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class RecommendationDraft:
    department_id: int
    title: str
    text: str
    text_employee: str | None
    priority: str
    model_version: str


@dataclass(frozen=True, slots=True)
class ArtifactStatus:
    artifact_exists: bool
    active_model_version: str | None
    model_type: str | None
    trained_at: str | None
    artifact_path: str | None
    train_rows: int | None
    unique_employees: int | None
    metrics: TrainingMetrics | None
    resolution_source: str  # active_manifest | legacy_latest | none
    manifest_path: str | None
    last_status: str
    last_reason: str


@dataclass(frozen=True, slots=True)
class ArtifactInfo:
    model_version: str | None
    model_type: str | None
    trained_at: str | None
    artifact_path: str
    train_rows: int | None
    unique_employees: int | None
    metrics: TrainingMetrics | None
    is_active: bool
    load_status: str  # ok | unreadable
    load_reason: str | None = None


@dataclass(frozen=True, slots=True)
class ActiveManifest:
    active_model_version: str
    model_type: str
    artifact_path: str
    promoted_at: str
    promoted_by: str
    note: str | None = None
    previous_model_version: str | None = None


@dataclass(frozen=True, slots=True)
class PromoteResult:
    status: str  # promoted | failed
    active_model_version: str | None
    previous_model_version: str | None
    artifact_path: str | None
    promoted_at: str | None
    note: str | None


@dataclass(frozen=True, slots=True)
class MLRunRecord:
    run_id: str
    operation_type: str  # train | refresh_recommendations
    started_at: str
    finished_at: str | None
    status: str  # running | success | failed | skipped
    reason: str
    triggered_by: str
    requested_model_type: str | None
    resulting_model_version: str | None
    artifact_path: str | None
    summary: dict[str, Any] | None
    note: str | None = None
    error: str | None = None
