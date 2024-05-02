import { App, Editor, FuzzySuggestModal, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, NotionSyncSettings, NotionSyncSettingsTab } from "./lib/settings";
import { loadTodos, sync } from "./lib/functions";
import { NotionTodo } from "./lib/types";

export default class NotionSyncPlugin extends Plugin {
	settings: NotionSyncSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "add-undone-notion-to-do",
			name: "Add undone Notion To-Do",
			editorCallback: async (editor) => {
				const todos = await loadTodos(this.settings);
				if (todos) {
					new AddTodoLinkModal(this.app, todos, editor).open();
				}
			},
		});

		this.addCommand({
			id: "sync-notion",
			name: "Sync Notion",
			callback: async () => {
				await sync(this.app, this.settings);
			},
		});

		this.addSettingTab(new NotionSyncSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

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

	getItemText(todo: NotionTodo): string {
		return `${todo.name} (${todo.identifier})
${todo.project || 'No Project'} | ${todo.status}`;
	}

	onChooseItem(todo: NotionTodo, evt: MouseEvent | KeyboardEvent) {
		new Notice(`Linked ${todo.name} (${todo.identifier})`);

		const currentLine = this.editor.getLine(this.editor.getCursor().line);

		if (currentLine.match("- \\[.\\] ")) {
			if (todo.status === "Done" || todo.status === "Archived") {
				this.editor.replaceRange(`- [x] `, { line: this.editor.getCursor().line, ch: 0 }, this.editor.getCursor());
			} else if (todo.status === "In Review" || todo.status === "Paused" || todo.status === "In Progress") {
				this.editor.replaceRange(`- [/] `, { line: this.editor.getCursor().line, ch: 0 }, this.editor.getCursor());
			} else if (todo.status === "Todo" || todo.status === "Backlog") {
				this.editor.replaceRange(`- [ ] `, { line: this.editor.getCursor().line, ch: 0 }, this.editor.getCursor());
			}
		}

		this.editor.replaceRange(`[${todo.name} (*${todo.identifier}*)](${todo.url}) `, this.editor.getCursor());
		this.editor.setCursor({
			line: this.editor.getCursor().line,
			ch: parseInt(this.editor.getLine(this.editor.getCursor().line)) + 1,
		});
	}
}
