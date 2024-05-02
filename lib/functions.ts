import { App, moment, Notice } from "obsidian";
import { NotionSyncSettings } from "./settings";
import { loadPage, updatePage } from "./notion";

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
						const todo = {
							identifier: `${page.properties["ID"].unique_id.prefix}-${page.properties["ID"].unique_id.number}`,
							name: page.properties["Task name"].title[0].plain_text,
							status: page.properties["Status"].status.name,
							url: page.url,
						};

						if (moment(file.stat.mtime).isBefore(moment(page.last_edited_time))) {
							console.log("Update locally", todo.status)
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
