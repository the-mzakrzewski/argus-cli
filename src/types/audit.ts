export interface AuditCreateRequest {
    ddlPath: string;
    queryPath: string;
}

export interface AuditCreatedResponse {
    public_id: string;
    status: string;
}
