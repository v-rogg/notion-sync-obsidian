import {
	App,
	Editor,
	FuzzySuggestModal,
	Modal,
	moment,
	Notice,
	Plugin,
	requestUrl,
	Setting,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	NotionSyncSettings,
	NotionSyncSettingsTab,
} from "./lib/settings";
import {loadDatabaseContent, loadPage} from './lib/notion';
import {sync} from './lib/functions';

interface notionSync {}

interface NotionTodo {
	identifier: string;
	name: string;
	status: string;
	url: string;
	project: string;
}

export default class NotionSyncPlugin extends Plugin {
	settings: NotionSyncSettings;
	notionSync: notionSync;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "add-undone-notion-to-do",
			name: "Add undone Notion To-Do",
			editorCallback: async (editor) => {
				let notice;
				if (!this.settings.apiToken || !this.settings.todoDatabaseId) {
					new Notice("Not all settings are set");
					return;
				} else {
					notice = new Notice("Loading Notion To-Do's");
				}
				const search = await loadDatabaseContent(
					this.settings.todoDatabaseId,
					this.settings.apiToken,
				);

				const todos: NotionTodo[] = [];
				const projectCache = new Map();

				for (let todo of search.results) {
					const identifier = `${todo.properties["ID"].unique_id.prefix}-${todo.properties["ID"].unique_id.number}`;
					const name =
						todo.properties["Task name"].title[0].plain_text;
					const status = todo.properties["Status"].status.name;
					const url = todo.url;
					const projectRelationId =
						todo.properties["Project"].relation[0].id;

					let project;
					if (!projectCache.has(projectRelationId)) {
						project = await loadPage(projectRelationId, this.settings.apiToken)

						projectCache.set(projectRelationId, project);
					} else {
						project = projectCache.get(projectRelationId);
					}

					todos.push({
						identifier,
						name,
						status,
						url,
						project:
							project.properties["Project name"].title[0]
								.plain_text,
					});
				}
				notice.hide();
				new AddTodoLinkModal(this.app, todos, editor).open();
			},
		});

		this.addCommand({
			id: 'sync-notion',
			name: 'Sync Notion',
			callback: async () => {
				const s = await sync(this.app, this.settings)
			}
		})

		this.addSettingTab(new NotionSyncSettingsTab(this.app, this));

		// const s = await sync(this.app, this.settings, this.linearClient, statusBar)
		// this.notionSync = {
		// 	teams: s.teams,
		// 	states: s.states,
		// 	issues: s.issues
		// };
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// async function sync(app: App, settings: NotionSyncSettings, linearClient: LinearClient, statusBar: HTMLElement) {
// 	const {vault, workspace} = app;
//
// 	statusBar.setText(`Linear ↺ (${moment().format('HH:mm:ss')})`)
//
// 	const enrichedIssues: EnrichedLinearIssue[] = []
// 	const issues = await getMyIssues(linearClient)
// 	for (const issue of issues) {
// 		enrichedIssues.push({
// 			id: issue.id,
// 			identifier: issue.identifier,
// 			title: issue.title,
// 			url: issue.url,
// 			updatedAt: issue.updatedAt,
// 			state: await issue.state || undefined,
// 			project: await issue.project || undefined
// 		});
// 	}
//
// 	console.log("Issues loaded")
//
// 	const enrichedIssuesMap: any = {}
// 	for (const issue of enrichedIssues) {
// 		enrichedIssuesMap[issue.identifier] = issue
// 	}
//
// 	console.log("Issues mapped")
//
// 	const lastOpenFilesPaths = workspace.getLastOpenFiles();
//
// 	console.log(lastOpenFilesPaths)
//
// 	for (const paths of lastOpenFilesPaths) {
// 		const file = vault.getFileByPath(paths)
// 		if (file) {
// 			const content = await vault.cachedRead(file);
// 			const lines = content.split('\n')
// 			for (let line of lines) {
// 				const idMatch = line.match('https:\\/\\/linear\\.app\\/[a-zA-Z0-9-_]+\\/issue\\/([a-zA-Z0-9-_]+)\\/')
// 				if (idMatch) {
// 					const issueId = idMatch[1];
// 					const issue = enrichedIssuesMap[issueId]
//
// 					if (issue) {
// 						if (moment(file.stat.mtime).isAfter(moment(issue.updatedAt))) {
// 							const checkboxMatch = line.match('- \\[(.)\\] ')
// 							if (checkboxMatch) {
// 								if (checkboxMatch[1] === "x" && issue.state.type !== "completed") {
// 									await linearClient.updateIssue(issue.id, {stateId: settings.doneWorkflowState});
// 									new Notice(`Marked issue ${issue.identifier} as completed`)
// 								} else if (checkboxMatch[1] === "/" && issue.state.type !== "started") {
// 									await linearClient.updateIssue(issue.id, {stateId: settings.inProgressWorkflowState});
// 									new Notice(`Marked issue ${issue.identifier} as started`)
// 								} else if (checkboxMatch[1] === " " && issue.state.type !== "unstarted" && issue.state.type === "backlog") {
// 									await linearClient.updateIssue(issue.id, {stateId: settings.todoWorkflowState});
// 									new Notice(`Marked issue ${issue.identifier} as todo`)
// 								} else if (checkboxMatch[1] === "-" && issue.state.type !== "canceled") {
// 									await linearClient.updateIssue(issue.id, {stateId: settings.cancelledWorkflowState});
// 									new Notice(`Marked issue ${issue.identifier} as cancelled`)
// 								}
// 							}
// 						}
// 					}
// 				}
// 			}
//
// 			console.log("Check all files")
//
// 			await vault.process(file, (data) => {
// 				const lines = data.split('\n')
// 				const updatedLines: any = []
// 				for (let line of lines) {
// 					const idMatch = line.match('https:\\/\\/linear\\.app\\/[a-zA-Z0-9-_]+\\/issue\\/([a-zA-Z0-9-_]+)\\/')
// 					if (idMatch) {
// 						const issueId = idMatch[1];
//
// 						const issue = enrichedIssuesMap[issueId];
//
// 						if (moment(file.stat.mtime).isBefore(moment(issue.updatedAt))) {
// 							console.log(line, issue.state?.type)
// 							if (issue.state?.type === "completed") {
// 								line = line.replace('- \\[.\\] ', '- [x] ')
// 								// this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 							} else if (issue.state?.type === "started") {
// 								line = line.replace('- \\[.\\] ', '- [/] ')
// 								// this.editor.replaceRange(`- [/] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 							} else if (issue.state?.type === "unstarted" || issue.state?.type === "backlog") {
// 								line = line.replace('- \\[.\\] ', '- [ ] ')
// 								// this.editor.replaceRange(`- [ ] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 							} else if (issue.state?.type === "canceled") {
// 								line = line.replace('- \\[.\\] ', '- [-] ')
// 								// this.editor.replaceRange(`- [-] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 							}
// 						}
// 					}
// 					updatedLines.push(line);
// 				}
//
// 				return updatedLines.join('\n')
// 			})
//
// 			console.log("Process all files")
// 		}
// 	}
//
// 	const teams = (await linearClient.teams()).nodes
// 	console.log("Teams loaded")
// 	const states = <WorkflowState[]>(await linearClient.workflowStates()).nodes
// 	console.log("States loaded")
// 	statusBar.setText(`Linear ✓ (${issues.length} | ${moment().format('HH:mm:ss')})`);
//
// 	return {issues: enrichedIssues, teams: teams, states}
// }

class AddTodoLinkModal extends FuzzySuggestModal<NotionTodo> {
	todos: NotionTodo[];
	editor: Editor;

	constructor(app: App, todos: NotionTodo[], editor: Editor) {
		super(app);
		this.editor = editor;
		this.todos = todos;
	}

	getItems(): NotionTodo[] {
		return this.todos.sort((a, b) => {
			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;

			return 0;
		});
	}

	getItemText(issue: NotionTodo): string {
		return `${issue.name} (${issue.identifier})
${issue.project} | ${issue.status}`;
	}

	onChooseItem(todo: NotionTodo, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Linked ${todo.name} (${todo.identifier})`);

		const currentLine = this.editor.getLine(this.editor.getCursor().line);

		if (currentLine.match("- \\[.\\] ")) {
			if (todo.status === "Done" || todo.status === "Archived") {
				this.editor.replaceRange(
					`- [x] `,
					{ line: this.editor.getCursor().line, ch: 0 },
					this.editor.getCursor(),
				);
			} else if (
				todo.status === "In Review" ||
				todo.status === "Paused" ||
				todo.status === "In Progress"
			) {
				this.editor.replaceRange(
					`- [/] `,
					{ line: this.editor.getCursor().line, ch: 0 },
					this.editor.getCursor(),
				);
			} else if (todo.status === "Todo" || todo.status === "Backlog") {
				this.editor.replaceRange(
					`- [ ] `,
					{ line: this.editor.getCursor().line, ch: 0 },
					this.editor.getCursor(),
				);
			}
		}

		this.editor.replaceRange(
			`[${todo.name} (*${todo.identifier}*)](${todo.url}) `,
			this.editor.getCursor(),
		);
		this.editor.setCursor({
			line: this.editor.getCursor().line,
			ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1,
		});
	}
}

// class AddUndoneIssueLinkModal extends FuzzySuggestModal<EnrichedLinearIssue> {
// 	issues: EnrichedLinearIssue[];
// 	editor: Editor;
// 	settings: NotionSyncSettings;
//
// 	constructor(app: App, settings: NotionSyncSettings, linearSync: notionSync, editor: Editor) {
// 		super(app);
// 		this.editor = editor;
// 		this.settings = settings;
//
// 		if (linearSync === undefined) {
// 			new Notice("Not yet synced");
// 		}
//
// 		this.issues = linearSync.issues
// 	}
//
// 	getItems(): EnrichedLinearIssue[] {
// 		return this.issues.filter((issue: EnrichedLinearIssue) => {
// 			return issue.state?.type === "started" || issue.state?.type === "unstarted" || issue.state?.type === "backlog"
// 		}).sort((a, b) => {
// 			// @ts-ignore
// 			if (a.state.position < b.state.position) return 1;
// 			// @ts-ignore
// 			if (a.state.position > b.state.position) return -1;
//
// 			// @ts-ignore
// 			if (a.project.name < b.project.name) return -1;
// 			// @ts-ignore
// 			if (a.project.name > b.project.name) return 1;
//
// 			if (a.title < b.title) return -1;
// 			if (a.title > b.title) return 1;
//
// 			return 0;
// 		});
// 	}
//
// 	getItemText(issue: EnrichedLinearIssue): string {
// 		return `${issue.title} (${issue.identifier})
// ${issue.project?.name} | ${issue.state?.name}`;
// 	}
//
// 	onChooseItem(issue: EnrichedLinearIssue, evt: MouseEvent | KeyboardEvent) {
// 		new Notice(`Linked ${issue.title} (${issue.identifier})`);
//
// 		const currentLine = this.editor.getLine(this.editor.getCursor().line)
//
// 		if (currentLine.match('- \\[.\\] ')) {
// 			if (issue.state?.type === "completed") {
// 				this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 			} else if (issue.state?.type === "started") {
// 				this.editor.replaceRange(`- [/] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 			} else if (issue.state?.type === "unstarted" || issue.state?.type === "backlog") {
// 				this.editor.replaceRange(`- [ ] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 			} else if (issue.state?.type === "canceled") {
// 				this.editor.replaceRange(`- [-] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
// 			}
// 		}
//
// 		this.editor.replaceRange(`[${issue.title} (*${issue.identifier}*)](${issue.url}) `, this.editor.getCursor())
// 		this.editor.setCursor({line: this.editor.getCursor().line, ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1})
// 	}
// }
