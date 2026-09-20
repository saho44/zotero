/**
 * Minimales Abbild der Zotero-Schnittstellen, die das Plugin benutzt.
 * Reicht nicht annähernd an das Original heran, deckt aber genug ab, um
 * die Endpunkte und die Serialisierung ohne laufendes Zotero zu prüfen.
 */

const ITEM_TYPES = { 1: "journalArticle", 2: "book", 3: "note", 4: "attachment", 5: "annotation" };
const CREATOR_TYPES = { 1: "author", 2: "editor" };

class FakeItem {
	constructor(data) {
		Object.assign(this, {
			id: data.id,
			key: data.key,
			libraryID: data.libraryID ?? 1,
			itemTypeID: data.itemTypeID ?? 1,
			dateAdded: data.dateAdded ?? "2024-01-01 10:00:00",
			dateModified: data.dateModified ?? "2024-01-02 10:00:00",
			deleted: data.deleted ?? false,
			_fields: data.fields ?? {},
			_creators: data.creators ?? [],
			_tags: data.tags ?? [],
			_collections: data.collections ?? [],
			_notes: data.notes ?? [],
			_attachments: data.attachments ?? [],
			_annotations: data.annotations ?? [],
			_note: data.note ?? "",
			attachmentContentType: data.contentType ?? "",
			attachmentFilename: data.filename ?? "",
			_text: data.text ?? "",
			annotationType: data.annotationType,
			annotationText: data.annotationText,
			annotationComment: data.annotationComment,
			annotationColor: data.annotationColor,
			annotationPageLabel: data.annotationPageLabel,
			annotationSortIndex: data.annotationSortIndex
		});
		this.loadCount = 0;
	}

	get attachmentText() {
		return Promise.resolve(this._text);
	}

	async loadAllData() {
		this.loadCount++;
	}

	getField(field) {
		if (!(field in this._fields)) {
			// Zotero wirft für Felder, die es beim Typ nicht gibt
			throw new Error(`Invalid field '${field}'`);
		}
		return this._fields[field];
	}

	getCreators() {
		return this._creators;
	}

	getTags() {
		return this._tags.map(tag => ({ tag }));
	}

	getCollections() {
		return this._collections;
	}

	getNotes() {
		return this._notes;
	}

	getAttachments() {
		return this._attachments;
	}

	getAnnotations() {
		return this._annotations.map(id => registry.get(id));
	}

	getNote() {
		return this._note;
	}

	getNoteTitle() {
		return this._note.replace(/<[^>]+>/g, "").split("\n")[0].slice(0, 40);
	}

	isRegularItem() {
		return this.itemTypeID === 1 || this.itemTypeID === 2;
	}

	isAttachment() {
		return this.itemTypeID === 4;
	}

	isFileAttachment() {
		return this.isAttachment() && !!this.attachmentContentType;
	}
}

const registry = new Map();

export function buildZotero() {
	registry.clear();

	const items = [
		new FakeItem({
			id: 1,
			key: "AAAA1111",
			itemTypeID: 1,
			dateModified: "2024-05-01 09:00:00",
			fields: {
				title: "Klimawandel und Küstenstädte",
				date: "2021-03-04",
				abstractNote: "Eine Untersuchung der Folgen für Hafenstädte.",
				publicationTitle: "Zeitschrift für Geographie",
				volume: "12",
				issue: "3",
				pages: "45-67",
				DOI: "10.1000/xyz",
				url: "https://example.org/a",
				language: "de"
			},
			creators: [
				{ firstName: "Anna", lastName: "Meier", creatorTypeID: 1, fieldMode: 0 },
				{ firstName: "Bert", lastName: "Schulz", creatorTypeID: 1, fieldMode: 0 },
				{ firstName: "Cem", lastName: "Yilmaz", creatorTypeID: 1, fieldMode: 0 }
			],
			tags: ["Klima", "Stadt"],
			collections: [10],
			notes: [3],
			attachments: [4]
		}),
		new FakeItem({
			id: 2,
			key: "BBBB2222",
			itemTypeID: 2,
			dateModified: "2024-04-01 09:00:00",
			fields: {
				title: "Handbuch der Stadtplanung",
				date: "2019",
				abstractNote: "",
				publisher: "Beispielverlag"
			},
			creators: [{ firstName: "Dana", lastName: "Krüger", creatorTypeID: 1, fieldMode: 0 }],
			tags: [],
			collections: []
		}),
		new FakeItem({ id: 3, key: "NOTE0003", itemTypeID: 3, note: "<p>Kernaussage: Pegel steigt.</p>" }),
		new FakeItem({
			id: 4,
			key: "ATTA0004",
			itemTypeID: 4,
			contentType: "application/pdf",
			filename: "meier2021.pdf",
			fields: { title: "Volltext-PDF" },
			text: "Seite 1 Text.\n\n\n\nSeite 2 Text.",
			annotations: [5]
		}),
		new FakeItem({
			id: 5,
			key: "ANNO0005",
			itemTypeID: 5,
			annotationType: "highlight",
			annotationText: "Der Meeresspiegel steigt schneller als erwartet.",
			annotationComment: "Für Kapitel 2 verwenden",
			annotationColor: "#ffd400",
			annotationPageLabel: "47",
			annotationSortIndex: "00047|000123"
		})
	];

	for (const item of items) {
		registry.set(item.id, item);
	}

	const prefs = new Map();

	// Bedingungen der zuletzt ausgefuehrten Suche - damit der Test pruefen kann,
	// welcher Suchumfang tatsaechlich angekommen ist.
	let lastSearchConditions = [];

	class FakeSearch {
		constructor() {
			this.conditions = [];
			this.libraryID = 1;
		}

		addCondition(condition, operator, value) {
			this.conditions.push({ condition, operator, value });
		}

		async search() {
			lastSearchConditions = this.conditions;
			const quick = this.conditions.find(c => String(c.condition).startsWith("quicksearch"));
			let result = [...registry.values()].filter(item => item.isRegularItem());
			if (quick) {
				const needle = String(quick.value).toLowerCase();
				result = result.filter(item =>
					JSON.stringify(item._fields).toLowerCase().includes(needle)
					|| item._creators.some(c => c.lastName.toLowerCase().includes(needle)));
			}
			const collection = this.conditions.find(c => c.condition === "collection");
			if (collection) {
				result = result.filter(item => item._collections.includes(10));
			}
			return result.map(item => item.id);
		}
	}

	const errors = [];

	return {
		version: "7.0.99",

		/** Vom Plugin gemeldete Fehler, damit der Test sie prüfen kann. */
		errors,

		/** Bedingungen der zuletzt ausgeführten Suche. */
		get lastSearchConditions() {
			return lastSearchConditions;
		},

		debug() {},
		logError(e) {
			errors.push(e);
		},

		Libraries: {
			userLibraryID: 1,
			exists: id => id === 1,
			getAll: () => [{ libraryID: 1, name: "Meine Bibliothek", libraryType: "user", editable: true }]
		},

		ItemTypes: { getName: id => ITEM_TYPES[id] || "document" },
		CreatorTypes: { getName: id => CREATOR_TYPES[id] || "author" },

		Items: {
			get: ids => (Array.isArray(ids)
				? ids.map(id => registry.get(id)).filter(Boolean)
				: registry.get(ids)),
			getAsync: async ids => (Array.isArray(ids)
				? ids.map(id => registry.get(id)).filter(Boolean)
				: registry.get(ids)),
			getByLibraryAndKeyAsync: async (libraryID, key) =>
				[...registry.values()].find(item => item.key === key) || false
		},

		Collections: {
			get: id => (id === 10 ? { key: "COLL0010", name: "Dissertation", libraryID: 1 } : null),
			getByLibrary: () => [{ key: "COLL0010", name: "Dissertation", parentKey: null, libraryID: 1 }],
			getByLibraryAndKey: (libraryID, key) =>
				(key === "COLL0010" ? { key: "COLL0010", name: "Dissertation", parentKey: null, libraryID: 1 } : null)
		},

		Search: FakeSearch,

		Date: {
			strToDate: (str) => {
				const match = String(str).match(/\d{4}/);
				return match ? { year: Number(match[0]) } : {};
			}
		},

		Utilities: {
			randomString: (length) => "t".repeat(length),
			unescapeHTML: html => String(html).replace(/<[^>]+>/g, ""),
			Internal: { copyTextToClipboard() {} }
		},

		Prefs: {
			get: key => prefs.get(key),
			set: (key, value) => prefs.set(key, value)
		},

		Server: { Endpoints: {} },

		Styles: {
			init: async () => {},
			get: styleID => (styleID.includes("apa")
				? {
					styleID,
					title: "APA",
					getCiteProc: () => ({
						updateItems() {},
						previewCitationCluster: () => "(Meier et al., 2021)",
						free() {}
					})
				}
				: null),
			getVisible: () => [{ styleID: "http://www.zotero.org/styles/apa", title: "APA" }]
		},

		Cite: {
			makeFormattedBibliography: () =>
				"Meier, A., Schulz, B., & Yilmaz, C. (2021). Klimawandel und Küstenstädte."
		},

		Translators: {
			getAllForType: async () => [{ translatorID: "9cb70025-a888-4a29-a210-93ec52da40d4", label: "BibTeX" }]
		},

		Translate: {
			Export: class {
				setItems() {}
				setTranslator() {}
				setHandler(name, callback) {
					this._done = callback;
				}
				async translate() {
					this.string = "@article{meier2021,\n  title = {Klimawandel und Küstenstädte}\n}";
					this._done(this, true);
				}
			}
		},

		getMainWindows: () => []
	};
}

export { registry };
