import { App, moment, Notice } from "obsidian";
import { NotionSyncSettings } from "./settings";
import {loadDatabaseContent, loadPage, updatePage} from './notion';
import {NotionTodo} from './types';

export async function loadTodos(settings: NotionSyncSettings) {
	let notice;
	if (!settings.apiToken || !settings.todoDatabaseId) {
		new Notice("Not all settings are set");
		return;
	} else {
		notice = new Notice("Loading Notion To-Do's");
	}
	const search = await loadDatabaseContent(settings.todoDatabaseId, settings.apiToken);

	const todos: NotionTodo[] = [];
	const projectCache = new Map();

	for (let page of search.results) {
		let todo = parseTodo(page)

		try {
			let project;
			const projectRelationId = page.properties["Project"].relation[0].id;
			if (!projectCache.has(projectRelationId)) {
				project = await loadPage(projectRelationId, settings.apiToken);

				projectCache.set(projectRelationId, project);
			} else {
				project = projectCache.get(projectRelationId);
			}

			todo.project = project.properties["Project name"].title[0].plain_text;
		} catch (e) {}

		todos.push(todo);
	}
	notice.hide();

	return todos
}

export async function sync(app: App, settings: NotionSyncSettings) {
	if (!settings.apiToken) {
		new Notice("API token is missing. Please configure the plugin settings.");
		return;
	}

	const { vault, workspace } = app;
	const lastOpenFilesPaths = workspace.getLastOpenFiles();
	const pageCache = new Map();

	for (const path of lastOpenFilesPaths) {
		const file = vault.getFileByPath(path);
		if (file) {
			const content = await vault.cachedRead(file);
			const lines = content.split("\n");
			for (const line of lines) {
				const idMatch = line.match("\\[.*\\]\\(https:\\/\\/www\\.notion\\.so\\/[a-zA-Z-]+-([a-z0-9]+)\\)");
				if (idMatch) {
					const todoId = idMatch[1];

					const page = await loadPage(todoId, settings.apiToken);
					const todo = {
						identifier: `${page.properties["ID"].unique_id.prefix}-${page.properties["ID"].unique_id.number}`,
						name: page.properties["Task name"].title[0].plain_text,
						status: page.properties["Status"].status.name,
						url: page.url,
					};
					pageCache.set(todoId, page);

					if (moment(file.stat.mtime).isAfter(moment(page.last_edited_time))) {
						const checkboxMatch = line.match("- \\[(.)\\] ");
						if (checkboxMatch) {
							if (checkboxMatch[1] === "x" && todo.status !== "Done" && todo.status !== "Archived") {
								await updatePage(todoId, settings.apiToken, {
									properties: {
										Status: { status: { name: "Done" } },
									},
								});
								new Notice(`Synced To-Do ${todo.identifier} as Done`);
							} else if (
								checkboxMatch[1] === "/" &&
								todo.status !== "In Review" &&
								todo.status !== "Paused" &&
								todo.status !== "In Progress"
							) {
								await updatePage(todoId, settings.apiToken, {
									properties: {
										Status: { status: { name: "In Progress" } },
									},
								});
								new Notice(`Synced issue ${todo.identifier} as In Progress`);
							} else if (checkboxMatch[1] === " " && todo.status !== "Todo" && todo.status !== "Backlog") {
								await updatePage(todoId, settings.apiToken, {
									properties: {
										Status: { status: { name: "Todo" } },
									},
								});
								new Notice(`Synced To-Do ${todo.identifier} as Todo`);
							}
						}
					}
				}
			}

			await vault.process(file, (data) => {
				const lines = data.split("\n");
				const newLines: string[] = [];

				for (let line of lines) {
					const idMatch = line.match("\\[.*\\]\\(https:\\/\\/www\\.notion\\.so\\/[a-zA-Z-]+-([a-z0-9]+)\\)");
					if (idMatch) {
						const todoId = idMatch[1];
						const page = pageCache.get(todoId);
						const todo = parseTodo(page);

						if (moment(file.stat.mtime).isBefore(moment(page.last_edited_time))) {
							if (todo.status === "Done" || todo.status === "Archived") {
								line = line.replace(/- \[.\] /, "- [x] ");
								new Notice(`Marked To-Do ${todo.identifier} as Done`);
							} else if (todo.status === "In Review" || todo.status === "Paused" || todo.status === "In Progress") {
								line = line.replace(/- \[.\] /, "- [/] ");
								new Notice(`Marked To-Do ${todo.identifier} as In Progress`);
							} else if (todo.status === "Todo" || todo.status === "Backlog") {
								line = line.replace(/- \[.\] /, "- [ ] ");
								new Notice(`Marked To-Do ${todo.identifier} as Todo`);
							}
						}
					}
					newLines.push(line);
				}

				return newLines.join("\n");
			});
		}
	}
}

function parseTodo(page: any): NotionTodo {
	let name = "";

	for (const title of page.properties["Task name"].title) {
		name += title.plain_text
	}

	return {
		identifier: `${page.properties["ID"].unique_id.prefix}-${page.properties["ID"].unique_id.number}`,
		name: name,
		status: page.properties["Status"].status.name,
		url: page.url,
	}
}
