from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


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


class DashboardBlockPercentage(BaseModel):
    block_index: int
    title: str
    value: float


class DashboardResponse(BaseModel):
    essi_index: float
    essi_delta_pct: float
    engagement_pct: float
    engagement_delta_pct: float
    risk_level: str
    risk_crisis_count: int = 0
    risk_zone_count: int = 0
    risk_at_risk_total: int = 0
    risk_indexed_employees: int = 0
    risk_employees_delta_pct: float | None = None
    productivity_pct: float
    productivity_delta_pct: float
    essi_series: list[DashboardSeriesPoint]
    block_percentages: list[DashboardBlockPercentage]
    department_bars: list[DashboardDepartmentBar]
    recent_employees: list[DashboardEmployeeRow]
    recommendations_preview: list[DashboardRecommendation]


class SurveyBlockAnswer(BaseModel):
    block_index: int = Field(ge=1, le=5)
    scores: list[float]

    @model_validator(mode="after")
    def validate_scores(self):
        if len(self.scores) != 5:
            raise ValueError(f"Блок {self.block_index}: должно быть ровно 5 ответов")
        for score in self.scores:
            if score < 1 or score > 5:
                raise ValueError(f"Блок {self.block_index}: каждый ответ должен быть в диапазоне 1..5")
        return self


class SurveySubmitRequest(BaseModel):
    employee_id: int | None = None
    survey_date: date | None = None
    campaign_id: int | None = None
    blocks: list[SurveyBlockAnswer]

    @model_validator(mode="after")
    def validate_blocks(self):
        if len(self.blocks) != 5:
            raise ValueError("Опрос должен содержать ровно 5 блоков")
        indexes = [block.block_index for block in self.blocks]
        if sorted(indexes) != [1, 2, 3, 4, 5]:
            raise ValueError("Опрос должен содержать блоки 1..5 без повторов и пропусков")
        return self


class SurveyTemplateQuestion(BaseModel):
    id: int
    block_index: int
    order_in_block: int
    text: str


class SurveyBlockTitleOut(BaseModel):
    block_index: int = Field(ge=1, le=5)
    title: str


class SurveyTemplateResponse(BaseModel):
    questions: list[SurveyTemplateQuestion]
    block_titles: list[SurveyBlockTitleOut]


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


class EconomyDefaultsOut(BaseModel):
    suggested_essi: float
    draft_fot: float | None = None
    draft_k: float | None = None
    draft_c_replace: float | None = None
    draft_departed_count: int | None = None


class EconomyDraftsPatch(BaseModel):
    default_fot: float | None = Field(default=None, ge=0)
    default_k: float | None = Field(default=None, ge=0)
    default_c_replace: float | None = Field(default=None, ge=0)
    default_departed_count: int | None = Field(default=None, ge=0)


class SurveyCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    starts_at: date | None = None
    ends_at: date | None = None


class SurveyCampaignOut(BaseModel):
    id: int
    name: str
    status: str
    starts_at: date | None
    ends_at: date | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SurveyCampaignPatch(BaseModel):
    status: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    starts_at: date | None = None
    ends_at: date | None = None


class EmployeeCampaignOut(BaseModel):
    id: int
    name: str
    status: str
    starts_at: date | None
    ends_at: date | None
    completed: bool


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


class EmployeeSurveyRow(BaseModel):
    id: int
    survey_date: date
    source: str
    score_block1: float
    score_block2: float
    score_block3: float
    score_block4: float
    score_block5: float
    essi: float
    block_percentages: list[float]


class EmployeeDetailOut(EmployeeListItem):
    surveys: list[EmployeeSurveyRow] = []
    redacted: bool = False
    has_linked_user: bool = False


class DepartmentListItem(BaseModel):
    id: int
    name: str
    employee_count: int
    avg_essi: float


class DepartmentBasic(BaseModel):
    id: int
    name: str


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


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class DepartmentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    department_id: int
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    hire_date: date | None = None


class EmployeePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    department_id: int | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    hire_date: date | None = None


class MySurveyRow(BaseModel):
    id: int
    survey_date: date
    source: str
    score_block1: float
    score_block2: float
    score_block3: float
    score_block4: float
    score_block5: float
    essi: float
    block_percentages: list[float]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str | None
    read_at: datetime | None
    created_at: datetime


class SearchResultItem(BaseModel):
    kind: str  # employee | department
    id: int
    label: str
