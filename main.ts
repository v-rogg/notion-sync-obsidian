import {
	App,
	Editor,
	FuzzySuggestModal,
	moment,
	Notice,
	Plugin,
} from 'obsidian';
import {LinearSyncSettingTab} from './lib/settings';
import {Issue, LinearClient} from '@linear/sdk';
import {getMyIssues} from './lib/linear';


interface LinearSyncSettings {
	apiKey: string | null;
}

const DEFAULT_SETTINGS: LinearSyncSettings = {
	apiKey: null
}

export default class LinearSyncPlugin extends Plugin {
	settings: LinearSyncSettings;
	linearClient: LinearClient;
	syncedIssues: Issue[] = [];

	async onload() {
		await this.loadSettings();

		if (typeof this.settings.apiKey === "string") {
			this.linearClient = new LinearClient({apiKey: this.settings.apiKey})
		} else {
			new Notice(`No API key loaded`);
		}

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBar = this.addStatusBarItem();
		statusBar.setText(`Linear ×`);
		statusBar.onClickEvent(async () => {
			this.syncedIssues = await sync(this.app, this.linearClient, statusBar)
		})

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'add-linear-issue',
			name: 'Add Linear Issue',
			editorCallback: (editor) => {
				new AddIssueLinkModal(this.app, this.syncedIssues, editor).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LinearSyncSettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(async () => {
			this.syncedIssues = await sync(this.app, this.linearClient, statusBar)
		}, 60 * 1000));

		this.syncedIssues = await sync(this.app, this.linearClient, statusBar);
	}

	onunload() {
		this.registerEvent(this.app.vault.on('create', () => {
			console.log('a new file has entered the arena')
		}));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

async function sync(app: App, linearClient: LinearClient, statusBar: HTMLElement) {
	const {vault, workspace} = app;
	const queriedIssues: any = {};

	statusBar.setText(`Linear ↺ (${moment().format('HH:mm:ss')})`);

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

					let issue;
					if (issueId in queriedIssues) {
						issue = queriedIssues[issueId];
					} else {
						issue = await linearClient.issue(issueId);
						queriedIssues[issueId] = issue;
					}

					if (moment(file.stat.mtime).isAfter(moment(issue.updatedAt))) {
						const checkboxMatch = line.match('- \\[(.)\\] ')
						if (checkboxMatch) {
							if (checkboxMatch[1] === "x" && issue.completedAt === undefined) {
								// TODO: Add 'in progress' states
								const workflowStates = await linearClient.workflowStates()
								await linearClient.updateIssue(issue.identifier, {stateId: workflowStates.nodes.find((a) => {return a.type === "completed"})?.id});
							} else if (checkboxMatch[1] === " " && issue.completedAt !== undefined) {
								const workflowStates = await linearClient.workflowStates()
								await linearClient.updateIssue(issue.identifier, {stateId: workflowStates.nodes.find((a) => {return a.type === "unstarted"})?.id});
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

						let issue = queriedIssues[issueId];

						if (moment(file.stat.mtime).isBefore(moment(issue.updatedAt))) {
							if (issue.completedAt !== undefined) {
								line = line.replace('- [ ] ', '- [x] ')
							} else {
								line = line.replace('- [x] ', '- [ ] ')
							}
						}
					}
					updatedLines.push(line);
				}

				return updatedLines.join('\n')
			})
		}
	}

	const issues = await getMyIssues(linearClient)

	statusBar.setText(`Linear ✓ (${issues.length} | ${moment().format('HH:mm:ss')})`);

	return issues
}


interface MappedIssue {
	id: string
	title: string
	url: string
	completed: boolean
}

class AddIssueLinkModal extends FuzzySuggestModal<MappedIssue> {
	issues: MappedIssue[];
	editor: Editor;

	constructor(app: App, issues: Issue[], editor: Editor) {
		super(app);
		this.editor = editor;
		this.issues = issues.map(issue => {
			return {
				id: issue.identifier,
				title: issue.title,
				url: issue.url,
				completed: issue.completedAt !== undefined
			}
		})
	}

	getItems(): MappedIssue[] {
		return this.issues;
	}

	getItemText(issue: MappedIssue): string {
		return `${issue.title} (${issue.id})`;
	}

	onChooseItem(issue: MappedIssue, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Linked ${issue.title} (${issue.id})`);

		const currentLine = this.editor.getLine(this.editor.getCursor().line)

		console.log(currentLine)
		console.log(currentLine.match('- \\[.\\] '))

		if (currentLine.match('- \\[.\\] ') && issue.completed) {
			console.log("mark done")
			this.editor.replaceRange(`- [x] `, {line: this.editor.getCursor().line, ch: 0}, this.editor.getCursor())
		}

		this.editor.replaceRange(`[${issue.title} (*${issue.id}*)](${issue.url}) `, this.editor.getCursor())
		this.editor.setCursor({line: this.editor.getCursor().line, ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1})
	}
}


