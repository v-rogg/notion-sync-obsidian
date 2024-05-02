import { requestUrl } from "obsidian";

export async function loadDatabaseContent(
	databaseId: string,
	apiToken: string,
) {
	const res = await requestUrl({
		method: "POST",
		url: `https://api.notion.com/v1/databases/${databaseId}/query`,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			"Notion-Version": "2022-06-28",
		},
		body: JSON.stringify({
			filter: {
				or: [
					{
						property: "Status",
						status: {
							does_not_equal: "Done",
						},
					},
				],
			},
		}),
	});
	return res.json;
}

export async function loadPage(pageId: string, apiToken: string) {
	const res = await requestUrl({
		method: "GET",
		url: `https://api.notion.com/v1/pages/${pageId}/`,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			"Notion-Version": "2022-06-28",
		},
	});
	return res.json;
}

export async function searchForDatabases(apiToken: string) {
	console.log(apiToken)
	const res = await requestUrl({
		method: "POST",
		url: "https://api.notion.com/v1/search",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
			"Notion-Version": "2022-06-28",
		},
		body: JSON.stringify({
			query: "External tasks",
			filter: {
				value: "database",
				property: "object",
			},
			sort: {
				direction: "ascending",
				timestamp: "last_edited_time",
			},
		}),
	});
	return res.json;
}
