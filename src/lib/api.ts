import fs from 'node:fs/promises';
import {getEngineBaseUrl} from '../config.js';

interface FileField {
    filePath: string;
    filename: string
}

type MultipartField = string | FileField;

function isFileField(value: MultipartField): value is FileField {
    return typeof value === 'object' && 'filePath' in value;
}

export async function postMultipart<T>(
    path: string,
    fields: Record<string, MultipartField>,
): Promise<T> {
    const form = new FormData();

    for (const [name, value] of Object.entries(fields)) {
        if (isFileField(value)) {
            const buffer = await fs.readFile(value.filePath);
            const blob = new Blob([buffer]);
            form.append(name, blob, value.filename);
        } else {
            form.append(name, value);
        }
    }

    const url = `${getEngineBaseUrl()}${path}`;
    const response = await fetch(url, {method: 'POST', body: form});

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`API request failed [${response.status}]: ${body}`);
    }

    return response.json() as Promise<T>;
}
