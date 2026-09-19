/**
 * Zotero Claude Bridge - Datenzugriff
 *
 * Alle Funktionen, die Daten aus Zotero lesen und in einfaches JSON
 * uebersetzen. Bewusst frei von HTTP-Details, damit sie auch aus der
 * Zotero-Konsole heraus getestet werden koennen.
 */

var ZoteroClaudeAPI = {
	DEFAULT_STYLE: "http://www.zotero.org/styles/apa",
	DEFAULT_LOCALE: "de-DE",
	MAX_RESULTS: 100,
	MAX_FULLTEXT_CHARS: 200000,

	EXPORT_TRANSLATORS: {
		bibtex: "9cb70025-a888-4a29-a210-93ec52da40d4",
		biblatex: "b6e39b57-8942-4d11-8259-342c46ce395f",
		ris: "32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7",
		csljson: "bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7"
	},

	/* ----------------------------------------------------------------- *
	 * Hilfsfunktionen
	 * ----------------------------------------------------------------- */

	/**
	 * getField wirft fuer Felder, die es beim jeweiligen Eintragstyp nicht
	 * gibt. Wir wollen in dem Fall schlicht einen leeren String.
	 */
	_field: function (item, field) {
		try {
			return item.getField(field) || "";
		}
		catch (e) {
			return "";
		}
	},

	/**
	 * Zotero laedt Felder, Tags und Sammlungen teilweise erst bei Bedarf.
	 * Vor dem Serialisieren einmal alles nachladen, sonst wirft getField().
	 */
	_loadData: async function (items) {
		for (let item of items) {
			try {
				await item.loadAllData();
			}
			catch (e) {
				// Aeltere Zotero-Versionen laden bereits beim Start alles
			}
		}
		return items;
	},

	_loadItemsByID: async function (ids) {
		if (!ids || !ids.length) {
			return [];
		}
		let items = await Zotero.Items.getAsync(ids);
		return this._loadData(items.filter(Boolean));
	},

	_libraryID: function (libraryID) {
		if (libraryID === undefined || libraryID === null || libraryID === "") {
			return Zotero.Libraries.userLibraryID;
		}
		let id = parseInt(libraryID, 10);
		if (isNaN(id) || !Zotero.Libraries.exists(id)) {
			throw new Error("Unbekannte Bibliothek: " + libraryID);
		}
		return id;
	},

	_clampLimit: function (limit, fallback) {
		let n = parseInt(limit, 10);
		if (isNaN(n) || n <= 0) {
			n = fallback;
		}
		return Math.min(n, this.MAX_RESULTS);
	},

	_year: function (item) {
		let date = this._field(item, "date");
		if (!date) {
			return "";
		}
		try {
			let parsed = Zotero.Date.strToDate(date);
			return parsed && parsed.year ? String(parsed.year) : "";
		}
		catch (e) {
			let match = String(date).match(/\d{4}/);
			return match ? match[0] : "";
		}
	},

	_htmlToText: function (html) {
		if (!html) {
			return "";
		}
		let text = String(html)
			.replace(/<\s*br\s*\/?\s*>/gi, "\n")
			.replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
			.replace(/<\s*li\s*>/gi, "- ");
		try {
			text = Zotero.Utilities.unescapeHTML(text);
		}
		catch (e) {
			text = text.replace(/<[^>]+>/g, "");
		}
		return text.replace(/\n{3,}/g, "\n\n").trim();
	},

	/**
	 * Kurzform der Autorenangabe, z. B. "Meier et al." oder "Meier & Schmidt".
	 */
	_authorString: function (creators) {
		let names = creators
			.filter(c => c.creatorType === "author")
			.map(c => c.lastName || c.name);
		if (!names.length) {
			names = creators.map(c => c.lastName || c.name);
		}
		if (!names.length) {
			return "";
		}
		if (names.length === 1) {
			return names[0];
		}
		if (names.length === 2) {
			return names[0] + " & " + names[1];
		}
		return names[0] + " et al.";
	},

	_creators: function (item) {
		return item.getCreators().map((c) => {
			let typeName = "";
			try {
				typeName = Zotero.CreatorTypes.getName(c.creatorTypeID);
			}
			catch (e) {
				typeName = "author";
			}
			return {
				creatorType: typeName,
				firstName: c.firstName || "",
				lastName: c.lastName || c.name || "",
				name: c.fieldMode === 1
					? (c.lastName || c.name || "")
					: [c.firstName, c.lastName].filter(Boolean).join(" ")
			};
		});
	},

	_fileAttachments: function (item) {
		if (item.isAttachment()) {
			return item.isFileAttachment() ? [item] : [];
		}
		let ids = item.getAttachments();
		if (!ids || !ids.length) {
			return [];
		}
		return Zotero.Items.get(ids).filter(a => a && a.isFileAttachment());
	},

	/**
	 * PDFs zuerst - das ist fast immer der Volltext, den man haben will.
	 */
	_sortedAttachments: function (item) {
		return this._fileAttachments(item).sort((a, b) => {
			let aPDF = a.attachmentContentType === "application/pdf" ? 0 : 1;
			let bPDF = b.attachmentContentType === "application/pdf" ? 0 : 1;
			return aPDF - bPDF;
		});
	},

	/* ----------------------------------------------------------------- *
	 * Serialisierung
	 * ----------------------------------------------------------------- */

	serializeItem: function (item) {
		let creators = this._creators(item);
		let attachments = this._fileAttachments(item);
		let noteIDs = item.isRegularItem() ? item.getNotes() : [];

		let annotationCount = 0;
		for (let att of attachments) {
			try {
				annotationCount += att.getAnnotations().length;
			}
			catch (e) {
				// Anhang ohne Annotationsunterstuetzung - ignorieren
			}
		}

		let collections = [];
		try {
			collections = item.getCollections()
				.map(id => Zotero.Collections.get(id))
				.filter(Boolean)
				.map(c => ({ key: c.key, name: c.name }));
		}
		catch (e) {
			collections = [];
		}

		return {
			key: item.key,
			libraryID: item.libraryID,
			itemType: Zotero.ItemTypes.getName(item.itemTypeID),
			title: this._field(item, "title"),
			creators: creators,
			authorString: this._authorString(creators),
			year: this._year(item),
			date: this._field(item, "date"),
			publication: this._field(item, "publicationTitle")
				|| this._field(item, "bookTitle")
				|| this._field(item, "proceedingsTitle")
				|| this._field(item, "websiteTitle"),
			publisher: this._field(item, "publisher"),
			volume: this._field(item, "volume"),
			issue: this._field(item, "issue"),
			pages: this._field(item, "pages"),
			DOI: this._field(item, "DOI"),
			ISBN: this._field(item, "ISBN"),
			url: this._field(item, "url"),
			language: this._field(item, "language"),
			abstract: this._field(item, "abstractNote"),
			tags: item.getTags().map(t => t.tag),
			collections: collections,
			dateAdded: item.dateAdded,
			dateModified: item.dateModified,
			hasPDF: attachments.some(a => a.attachmentContentType === "application/pdf"),
			numAttachments: attachments.length,
			numNotes: noteIDs.length,
			numAnnotations: annotationCount,
			zoteroURI: "zotero://select/library/items/" + item.key
		};
	},

	/* ----------------------------------------------------------------- *
	 * Suche
	 * ----------------------------------------------------------------- */

	search: async function ({ query, limit, libraryID, collectionKey, itemType, tag, mode } = {}) {
		let libID = this._libraryID(libraryID);
		let max = this._clampLimit(limit, 20);

		let search = new Zotero.Search();
		search.libraryID = libID;

		if (collectionKey) {
			let collection = Zotero.Collections.getByLibraryAndKey(libID, collectionKey);
			if (!collection) {
				throw new Error("Unbekannte Sammlung: " + collectionKey);
			}
			search.addCondition("collection", "is", collection.key);
			search.addCondition("recursive", "true");
		}

		if (itemType) {
			search.addCondition("itemType", "is", itemType);
		}

		if (tag) {
			search.addCondition("tag", "is", tag);
		}

		let text = (query || "").trim();
		if (text) {
			let condition = mode === "everything"
				? "quicksearch-everything"
				: "quicksearch-titleCreatorYear";
			search.addCondition(condition, "contains", text);
		}
		else {
			// Ohne Suchbegriff: zuletzt geaenderte Eintraege zeigen
			search.addCondition("noChildren", "true");
		}

		let ids = await search.search();
		if (!ids.length) {
			return { items: [], total: 0, libraryID: libID };
		}

		let items = await Zotero.Items.getAsync(ids);
		items = items.filter(item => item && item.isRegularItem() && !item.deleted);

		if (!text) {
			items.sort((a, b) => String(b.dateModified).localeCompare(String(a.dateModified)));
		}

		let total = items.length;
		// Nur die tatsaechlich gelieferten Eintraege vollstaendig laden -
		// bei grossen Bibliotheken macht das den Unterschied.
		let page = await this._loadData(items.slice(0, max));

		return {
			items: page.map(item => this.serializeItem(item)),
			total: total,
			truncated: total > max,
			libraryID: libID
		};
	},

	recent: async function ({ limit, libraryID } = {}) {
		let libID = this._libraryID(libraryID);
		let max = this._clampLimit(limit, 20);

		let search = new Zotero.Search();
		search.libraryID = libID;
		search.addCondition("noChildren", "true");

		let ids = await search.search();
		let items = await Zotero.Items.getAsync(ids);
		items = items
			.filter(item => item && item.isRegularItem() && !item.deleted)
			.sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));

		let page = await this._loadData(items.slice(0, max));

		return {
			items: page.map(item => this.serializeItem(item)),
			total: items.length,
			libraryID: libID
		};
	},

	/* ----------------------------------------------------------------- *
	 * Einzelne Eintraege
	 * ----------------------------------------------------------------- */

	getItem: async function (key, libraryID) {
		if (!key) {
			throw new Error("Parameter 'key' fehlt");
		}
		let libID = this._libraryID(libraryID);
		let item = await Zotero.Items.getByLibraryAndKeyAsync(libID, key);
		if (!item) {
			throw new Error("Eintrag nicht gefunden: " + key);
		}
		await this._loadData([item]);
		return item;
	},

	itemDetail: async function ({ key, libraryID } = {}) {
		let item = await this.getItem(key, libraryID);
		let data = this.serializeItem(item);

		let noteItems = await this._loadItemsByID(item.getNotes());
		data.notes = noteItems.map(note => ({
			key: note.key,
			title: note.getNoteTitle(),
			text: this._htmlToText(note.getNote())
		}));

		let attachmentItems = await this._loadData(this._sortedAttachments(item));
		data.attachments = attachmentItems.map(att => ({
			key: att.key,
			title: att.getField("title"),
			contentType: att.attachmentContentType || "",
			filename: att.attachmentFilename || ""
		}));

		data.annotations = await this.annotations({ key, libraryID })
			.then(result => result.annotations)
			.catch(() => []);

		return data;
	},

	annotations: async function ({ key, libraryID } = {}) {
		let item = await this.getItem(key, libraryID);
		let result = [];

		for (let att of this._sortedAttachments(item)) {
			let annotations = [];
			try {
				annotations = att.getAnnotations();
			}
			catch (e) {
				continue;
			}
			await this._loadData(annotations);
			annotations.sort((a, b) => String(a.annotationSortIndex || "")
				.localeCompare(String(b.annotationSortIndex || "")));

			for (let ann of annotations) {
				result.push({
					key: ann.key,
					attachmentKey: att.key,
					type: ann.annotationType || "",
					text: ann.annotationText || "",
					comment: ann.annotationComment || "",
					color: ann.annotationColor || "",
					page: ann.annotationPageLabel || "",
					tags: ann.getTags().map(t => t.tag)
				});
			}
		}

		return { key: item.key, annotations: result, total: result.length };
	},

	fullText: async function ({ key, libraryID, maxChars } = {}) {
		let item = await this.getItem(key, libraryID);
		let limit = parseInt(maxChars, 10);
		if (isNaN(limit) || limit <= 0) {
			limit = 40000;
		}
		limit = Math.min(limit, this.MAX_FULLTEXT_CHARS);

		for (let att of await this._loadData(this._sortedAttachments(item))) {
			let text = "";
			try {
				text = await att.attachmentText;
			}
			catch (e) {
				text = "";
			}
			if (text && text.trim()) {
				let cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
				return {
					key: item.key,
					attachmentKey: att.key,
					attachmentTitle: att.getField("title"),
					contentType: att.attachmentContentType || "",
					totalChars: cleaned.length,
					truncated: cleaned.length > limit,
					text: cleaned.slice(0, limit)
				};
			}
		}

		throw new Error(
			"Kein durchsuchbarer Volltext vorhanden. Das PDF ist entweder nicht "
			+ "indiziert oder ein reiner Scan ohne Texterkennung."
		);
	},

	notes: async function ({ key, libraryID } = {}) {
		let item = await this.getItem(key, libraryID);
		let noteItems = await this._loadItemsByID(item.getNotes());
		let notes = noteItems.map(note => ({
			key: note.key,
			title: note.getNoteTitle(),
			text: this._htmlToText(note.getNote())
		}));
		return { key: item.key, notes: notes, total: notes.length };
	},

	/* ----------------------------------------------------------------- *
	 * Zitate und Export
	 * ----------------------------------------------------------------- */

	styles: async function () {
		await Zotero.Styles.init();
		return {
			styles: Zotero.Styles.getVisible().map(style => ({
				id: style.styleID,
				title: style.title
			}))
		};
	},

	citations: async function ({ keys, libraryID, style, locale, format } = {}) {
		if (!keys || !keys.length) {
			throw new Error("Parameter 'keys' fehlt");
		}

		await Zotero.Styles.init();
		let styleID = style || this.DEFAULT_STYLE;
		let styleObj = Zotero.Styles.get(styleID);
		if (!styleObj) {
			throw new Error("Unbekannter Zitierstil: " + styleID);
		}

		let outputFormat = format === "html" ? "html" : "text";
		let items = [];
		for (let key of keys) {
			items.push(await this.getItem(key, libraryID));
		}

		let engine = styleObj.getCiteProc(locale || this.DEFAULT_LOCALE, outputFormat);
		let bibliography = "";
		let inText = [];

		try {
			engine.updateItems(items.map(item => item.id));
			bibliography = Zotero.Cite.makeFormattedBibliography(engine, outputFormat) || "";

			for (let item of items) {
				let citation = "";
				try {
					citation = engine.previewCitationCluster(
						{ citationItems: [{ id: item.id }], properties: {} },
						[], [], outputFormat
					);
				}
				catch (e) {
					citation = "";
				}
				inText.push({ key: item.key, citation: citation });
			}
		}
		finally {
			try {
				engine.free();
			}
			catch (e) {
				// citeproc-Engine ohne free() - nichts zu tun
			}
		}

		return {
			style: styleID,
			styleTitle: styleObj.title,
			locale: locale || this.DEFAULT_LOCALE,
			format: outputFormat,
			bibliography: String(bibliography).trim(),
			inTextCitations: inText
		};
	},

	translators: async function () {
		let translators = await Zotero.Translators.getAllForType("export");
		return {
			translators: translators.map(t => ({ id: t.translatorID, label: t.label }))
		};
	},

	export: async function ({ keys, libraryID, translator } = {}) {
		if (!keys || !keys.length) {
			throw new Error("Parameter 'keys' fehlt");
		}

		let translatorID = this.EXPORT_TRANSLATORS[translator] || translator
			|| this.EXPORT_TRANSLATORS.bibtex;

		let items = [];
		for (let key of keys) {
			items.push(await this.getItem(key, libraryID));
		}

		let translation = new Zotero.Translate.Export();
		translation.setItems(items);
		translation.setTranslator(translatorID);

		let output = await new Promise((resolve, reject) => {
			translation.setHandler("done", (obj, worked) => {
				if (worked) {
					resolve(obj.string || "");
				}
				else {
					reject(new Error("Export fehlgeschlagen (Translator: " + translatorID + ")"));
				}
			});
			translation.translate().catch(reject);
		});

		return { translator: translatorID, output: String(output).trim() };
	},

	/* ----------------------------------------------------------------- *
	 * Struktur
	 * ----------------------------------------------------------------- */

	libraries: function () {
		return {
			libraries: Zotero.Libraries.getAll().map(lib => ({
				libraryID: lib.libraryID,
				name: lib.name,
				type: lib.libraryType,
				editable: lib.editable,
				isDefault: lib.libraryID === Zotero.Libraries.userLibraryID
			}))
		};
	},

	collections: function ({ libraryID } = {}) {
		let libID = this._libraryID(libraryID);
		let collections = Zotero.Collections.getByLibrary(libID, true);
		return {
			libraryID: libID,
			collections: collections.map(c => ({
				key: c.key,
				name: c.name,
				parentKey: c.parentKey || null,
				level: this._collectionLevel(c)
			}))
		};
	},

	_collectionLevel: function (collection) {
		let level = 0;
		let parentKey = collection.parentKey;
		while (parentKey && level < 20) {
			level++;
			let parent = Zotero.Collections.getByLibraryAndKey(collection.libraryID, parentKey);
			parentKey = parent ? parent.parentKey : null;
		}
		return level;
	}
};
