from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models import UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: int
    username: str
    role: UserRole
    employee_id: int | None = None


class EmployeeIndexOut(BaseModel):
    employee_id: int
    essi: float


class DepartmentIndexOut(BaseModel):
    department_id: int
    avg_essi: float


class OrganizationIndexOut(BaseModel):
    organization_id: int = 1
    avg_essi: float


class DashboardSeriesPoint(BaseModel):
    id: str
    month: str
    value: float


class DashboardDepartmentBar(BaseModel):
    id: str
    department: str
    essi: float


class DashboardEmployeeRow(BaseModel):
    id: str
    name: str
    department: str
    essi: float
    trend: str
    status: str


class DashboardRecommendation(BaseModel):
    id: str
    title: str
    description: str
    priority: str
    status: str


class DashboardResponse(BaseModel):
    essi_index: float
    essi_delta_pct: float
    engagement_pct: float
    engagement_delta_pct: float
    risk_level: str
    risk_employees_delta_pct: float
    productivity_pct: float
    productivity_delta_pct: float
    essi_series: list[DashboardSeriesPoint]
    department_bars: list[DashboardDepartmentBar]
    recent_employees: list[DashboardEmployeeRow]
    recommendations_preview: list[DashboardRecommendation]


class SurveyBlockAnswer(BaseModel):
    block_index: int = Field(ge=1, le=5)
    scores: list[float] = Field(min_length=1)


class SurveySubmitRequest(BaseModel):
    employee_id: int | None = None
    survey_date: date | None = None
    blocks: list[SurveyBlockAnswer]


class SurveyTemplateQuestion(BaseModel):
    id: int
    block_index: int
    order_in_block: int
    text: str


class JobOut(BaseModel):
    id: int
    kind: str
    status: str
    detail: str | None
    created_at: datetime
    finished_at: datetime | None = None

    model_config = {"from_attributes": True}


class RecommendationOut(BaseModel):
    id: int
    department_id: int
    title: str
    description: str
    priority: str
    status: str
    created_at: datetime
    model_version: str | None = None

    model_config = {"from_attributes": True}


class RecommendationPatch(BaseModel):
    status: str | None = None


class EconomyRequest(BaseModel):
    fot: float = Field(ge=0)
    k: float = Field(ge=0)
    c_replace: float = Field(ge=0)
    essi_score: float = Field(default=100, ge=0, le=100)
    departed_count: int = Field(default=0, ge=0)


class EconomyResponse(BaseModel):
    loss_efficiency: float
    loss_turnover: float
    loss_total: float


class ConsentRequest(BaseModel):
    accepted: bool


class EmployeeListItem(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    department: str
    position: str | None
    essi: float
    engagement: float
    productivity: float
    trend: str
    status: str
    join_date: str | None


class DepartmentListItem(BaseModel):
    id: int
    name: str
    employee_count: int
    avg_essi: float


class ReportCreateRequest(BaseModel):
    kind: str = "summary"


class ReportExportOut(BaseModel):
    id: int
    kind: str
    status: str
    download_url: str | None = None
    detail: str | None = None


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=2)
    password: str = Field(min_length=6)
    role: UserRole
    employee_id: int | None = None
