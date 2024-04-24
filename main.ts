import {
	App,
	Editor,
	FuzzySuggestModal, Modal,
	moment,
	Notice,
	Plugin, Setting,
} from 'obsidian';
import {DEFAULT_SETTINGS, LinearSyncSettings, LinearSyncSettingTab} from './lib/settings';
import {LinearClient, Project, Team, WorkflowState} from '@linear/sdk';
import {getMyIssues} from './lib/linear';

interface LinearSync {
	teams: Team[],
	states: WorkflowState[],
	issues: EnrichedLinearIssue[]
}

interface EnrichedLinearIssue {
	id: string,
	identifier: string,
	title: string,
	url: string,
	updatedAt: Date,
	state: WorkflowState | undefined;
	project: Project | undefined
}

export default class LinearSyncPlugin extends Plugin {
	settings: LinearSyncSettings;
	linearClient: LinearClient;
	linearSync: LinearSync

	async onload() {
		await this.loadSettings();

		if (typeof this.settings.apiKey === "string") {
			this.linearClient = new LinearClient({apiKey: this.settings.apiKey})
		} else {
			new Notice(`No API key loaded`);
		}

		const statusBar = this.addStatusBarItem();
		statusBar.setText(`Linear ×`);
		statusBar.onClickEvent(async () => {
			const s = await sync(this.app, this.settings, this.linearClient, statusBar)
			this.linearSync = {
				teams: s.teams,
				states: s.states,
				issues: s.issues
			};
		})

		this.addCommand({
			id: 'add-linear-issue',
			name: 'Add Linear Issue',
			editorCallback: async (editor) => {
				new AddIssueLinkModal(this.app, this.settings, this.linearSync, editor).open();
			}
		});

		this.addCommand({
			id: 'add-undone-linear-issue',
			name: 'Add undone Linear Issue',
			editorCallback: async (editor) => {
				new AddUndoneIssueLinkModal(this.app, this.settings, this.linearSync, editor).open();
			}
		});

		this.addCommand({
			id: 'create-linear-issue',
			name: 'Create Linear Issue',
			editorCallback: async (editor) => {
				new CreateIssueModal(this.app, this.linearClient, this.linearSync, editor).open();
				const s = await sync(this.app, this.settings, this.linearClient, statusBar)
				this.linearSync = {
					teams: s.teams,
					states: s.states,
					issues: s.issues
				};
			}
		})

		this.addSettingTab(new LinearSyncSettingTab(this.app, this));

		this.registerInterval(window.setInterval(async () => {
			const s = await sync(this.app, this.settings, this.linearClient, statusBar)
			this.linearSync = {
				teams: s.teams,
				states: s.states,
				issues: s.issues
			};
		}, 60 * 1000));

		const s = await sync(this.app, this.settings, this.linearClient, statusBar)
		this.linearSync = {
			teams: s.teams,
			states: s.states,
			issues: s.issues
		};
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

async function sync(app: App, settings: LinearSyncSettings, linearClient: LinearClient, statusBar: HTMLElement) {
	const {vault, workspace} = app;

	statusBar.setText(`Linear ↺ (${moment().format('HH:mm:ss')})`)

	const enrichedIssues: EnrichedLinearIssue[] = []
	const issues = await getMyIssues(linearClient)
	for (const issue of issues) {
		enrichedIssues.push({
			id: issue.id,
			identifier: issue.identifier,
			title: issue.title,
			url: issue.url,
			updatedAt: issue.updatedAt,
			state: await issue.state || undefined,
			project: await issue.project || undefined
		});
	}
	const enrichedIssuesMap: any = {}
	for (const issue of enrichedIssues) {
		enrichedIssuesMap[issue.identifier] = issue
	}

	const lastOpenFilesPaths = workspace.getLastOpenFiles();
	for (const paths of lastOpenFilesPaths) {
		const file = vault.getFileByPath(paths)
		if (file) {
			const content = await vault.cachedRead(file);
			const lines = content.split('\n')
			for (let line of lines) {
				const idMatch = line.match('https:\\/\\/linear\\.app\\/[a-zA-Z0-9-_]+\\/issue\\/([a-zA-Z0-9-_]+)\\/')
				if (idMatch) {
					const issueId = idMatch[1];
					const issue = enrichedIssuesMap[issueId]

					if (issue) {
						if (moment(file.stat.mtime).isAfter(moment(issue.updatedAt))) {
							const checkboxMatch = line.match('- \\[(.)\\] ')
							if (checkboxMatch) {
								if (checkboxMatch[1] === "x" && issue.state.type !== "completed") {
									await linearClient.updateIssue(issue.id, {stateId: settings.doneWorkflowState});
									new Notice(`Marked issue ${issue.identifier} as completed`)
								} else if (checkboxMatch[1] === "/" && issue.state.type !== "started") {
									await linearClient.updateIssue(issue.id, {stateId: settings.inProgressWorkflowState});
									new Notice(`Marked issue ${issue.identifier} as started`)
								} else if (checkboxMatch[1] === " " && issue.state.type !== "unstarted" && issue.state.type === "backlog") {
									await linearClient.updateIssue(issue.id, {stateId: settings.todoWorkflowState});
									new Notice(`Marked issue ${issue.identifier} as todo`)
								} else if (checkboxMatch[1] === "-" && issue.state.type !== "canceled") {
									await linearClient.updateIssue(issue.id, {stateId: settings.cancelledWorkflowState});
									new Notice(`Marked issue ${issue.identifier} as cancelled`)
								}
							}
						}
					}
				}
			}

			await vault.process(file, (data) => {
				const lines = data.split('\n')
				const updatedLines: any = []
				for (let line of lines) {
					const idMatch = line.match('https:\\/\\/linear\\.app\\/[a-zA-Z0-9-_]+\\/issue\\/([a-zA-Z0-9-_]+)\\/')
					if (idMatch) {
						const issueId = idMatch[1];

						const issue = enrichedIssuesMap[issueId];

						if (moment(file.stat.mtime).isBefore(moment(issue.updatedAt))) {
							if (issue.state?.type === "completed") {
								this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
							} else if (issue.state?.type === "started") {
								this.editor.replaceRange(`- [/] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
							} else if (issue.state?.type === "unstarted" || issue.state?.type === "backlog") {
								this.editor.replaceRange(`- [ ] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
							} else if (issue.state?.type === "canceled") {
								this.editor.replaceRange(`- [-] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
							}
						}
					}
					updatedLines.push(line);
				}

				return updatedLines.join('\n')
			})
		}
	}

	const teams = (await linearClient.teams()).nodes
	const states = <WorkflowState[]>(await linearClient.workflowStates()).nodes

	statusBar.setText(`Linear ✓ (${issues.length} | ${moment().format('HH:mm:ss')})`);

	return {issues: enrichedIssues, teams: teams, states}
}

class AddIssueLinkModal extends FuzzySuggestModal<EnrichedLinearIssue> {
	issues: EnrichedLinearIssue[];
	editor: Editor;
	settings: LinearSyncSettings;

	constructor(app: App, settings: LinearSyncSettings, linearSync: LinearSync, editor: Editor) {
		super(app);
		this.editor = editor;
		this.settings = settings;
		this.issues = linearSync.issues
	}

	getItems(): EnrichedLinearIssue[] {
		return this.issues;
	}

	getItemText(issue: EnrichedLinearIssue): string {
		return `${issue.title} (${issue.identifier})
${issue.project?.name} | ${issue.state?.name}`;
	}

	onChooseItem(issue: EnrichedLinearIssue, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Linked ${issue.title} (${issue.identifier})`);

		const currentLine = this.editor.getLine(this.editor.getCursor().line)

		if (currentLine.match('- \\[.\\] ')) {
			if (issue.state?.type === "completed") {
				this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "started") {
				this.editor.replaceRange(`- [/] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "unstarted" || issue.state?.type === "backlog") {
				this.editor.replaceRange(`- [ ] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "canceled") {
				this.editor.replaceRange(`- [-] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			}
		}

		this.editor.replaceRange(`[${issue.title} (*${issue.identifier}*)](${issue.url}) `, this.editor.getCursor())
		this.editor.setCursor({line: this.editor.getCursor().line, ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1})
	}
}

class AddUndoneIssueLinkModal extends FuzzySuggestModal<EnrichedLinearIssue> {
	issues: EnrichedLinearIssue[];
	editor: Editor;
	settings: LinearSyncSettings;

	constructor(app: App, settings: LinearSyncSettings, linearSync: LinearSync, editor: Editor) {
		super(app);
		this.editor = editor;
		this.settings = settings;

		if (linearSync === undefined) {
			new Notice("Not yet synced");
		}

		this.issues = linearSync.issues
	}

	getItems(): EnrichedLinearIssue[] {
		return this.issues.filter((issue: EnrichedLinearIssue) => {
			return issue.state?.type === "started" || issue.state?.type === "unstarted" || issue.state?.type === "backlog"
		}).sort((a, b) => {
			// @ts-ignore
			if (a.state.position < b.state.position) return 1;
			// @ts-ignore
			if (a.state.position > b.state.position) return -1;

			// @ts-ignore
			if (a.project.name < b.project.name) return -1;
			// @ts-ignore
			if (a.project.name > b.project.name) return 1;

			if (a.title < b.title) return -1;
			if (a.title > b.title) return 1;

			return 0;
		});
	}

	getItemText(issue: EnrichedLinearIssue): string {
		return `${issue.title} (${issue.identifier})
${issue.project?.name} | ${issue.state?.name}`;
	}

	onChooseItem(issue: EnrichedLinearIssue, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Linked ${issue.title} (${issue.identifier})`);

		const currentLine = this.editor.getLine(this.editor.getCursor().line)

		if (currentLine.match('- \\[.\\] ')) {
			if (issue.state?.type === "completed") {
				this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "started") {
				this.editor.replaceRange(`- [/] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "unstarted" || issue.state?.type === "backlog") {
				this.editor.replaceRange(`- [ ] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			} else if (issue.state?.type === "canceled") {
				this.editor.replaceRange(`- [-] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
			}
		}

		this.editor.replaceRange(`[${issue.title} (*${issue.identifier}*)](${issue.url}) `, this.editor.getCursor())
		this.editor.setCursor({line: this.editor.getCursor().line, ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1})
	}
}

class CreateIssueModal extends Modal {
	result: {
		title: string | undefined
		team: string | undefined
	};
	linearClient: LinearClient;
	linearTeams: Team[];
	editor: Editor;

	constructor(app: App, linearClient: LinearClient, linearSync: LinearSync, editor: Editor) {
		super(app);
		this.linearClient = linearClient;
		this.linearTeams = linearSync.teams;
		this.result = {
			title: undefined,
			team: linearSync.teams[0].id
		}
		this.editor = editor
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", {text: "Create Linear Issue"})

		new Setting(contentEl)
			.setName("Issue Title")
			.addText((text) =>
				text.onChange((value) => {
					this.result.title = value
				}));

		new Setting(contentEl)
			.setName("Team")
			.addDropdown(drop => {
				for (let team of this.linearTeams) {
					drop.addOption(team.id, team.name)
				}
				drop.onChange(async (value) =>	{
					this.result.team = value
				});
			})

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Create")
					.setCta()
					.onClick(() => {
						this.close();
						this.submit();
					}));
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}

	async submit() {
		if (this.result.title !== undefined && this.result.team !== undefined) {
			const request = await this.linearClient.createIssue({
				title: this.result.title,
				teamId: this.result.team
			})
			const issue = await request.issue

			if (issue) {
				this.editor.replaceRange(`[${issue.title} (*${issue.identifier}*)](${issue.url}) `, this.editor.getCursor())
				this.editor.setCursor({line: this.editor.getCursor().line, ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1})
			}
		}
	}
}
