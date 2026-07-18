export interface AuditCreateRequest {
    ddlPath: string;
    queryPath: string;
}

export interface AuditCreatedResponse {
    public_id: string;
    status: string;
}

export interface AuditStatusResponse {
    public_id: string;
    status: string;
    failure_reason: string | null;
}
