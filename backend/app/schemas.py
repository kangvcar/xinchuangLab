from __future__ import annotations

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    student_id: str = Field(default="stu001", min_length=1)
    experiment_id: str = Field(default="file-basic", min_length=1)


class SimulateTerminalRequest(BaseModel):
    command: str = Field(min_length=1, max_length=500)

