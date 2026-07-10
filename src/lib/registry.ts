import {request} from 'undici';
import {agent} from './http.js';

const DOCKER_HUB_TAGS_URL = 'https://hub.docker.com/v2/repositories/library/postgres/tags';

// Debian/Alpine flavor suffixes published for the official postgres image.
const FLAVOR_PATTERN = /-(alpine|bookworm|bullseye|trixie|slim)/;

async function tagExists(tag: string): Promise<boolean> {
    let statusCode: number;
    try {
        const response = await request(`${DOCKER_HUB_TAGS_URL}/${encodeURIComponent(tag)}`, {dispatcher: agent});
        statusCode = response.statusCode;
        await response.body.dump();
    } catch (err) {
        throw new Error(`Could not verify postgres version against Docker Hub: ${(err as Error).message}`);
    }
    if (statusCode === 200) return true;
    if (statusCode === 404) return false;
    throw new Error(`Could not verify postgres version against Docker Hub: unexpected HTTP ${statusCode}`);
}

export async function resolvePostgresImage(version: string): Promise<string> {
    const candidates = FLAVOR_PATTERN.test(version) ? [version] : [`${version}-alpine`, version];

    for (const tag of candidates) {
        if (await tagExists(tag)) {
            return `postgres:${tag}`;
        }
    }

    throw new Error(
        `Postgres version '${version}' does not exist on Docker Hub (tried tags: ${candidates.join(', ')})`,
    );
}
