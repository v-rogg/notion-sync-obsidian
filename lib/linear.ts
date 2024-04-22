import { LinearClient } from '@linear/sdk';

export async function getMyIssues(c: LinearClient) {
	const me = await c.viewer;
	const issues = await me.assignedIssues({});

	return issues.nodes
}

