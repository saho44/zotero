/**
 * Baut aus Zotero-Daten die Textblöcke, die in den Claude-Chat eingefügt
 * werden. Bewusst reines Markdown ohne Sonderzeichen-Spielereien, damit
 * Claude die Struktur zuverlässig erkennt.
 */

function itemHeadline(item) {
	const parts = [item.title || "Ohne Titel"];
	const meta = [item.authorString, item.year].filter(Boolean).join(", ");
	if (meta) {
		parts.push(`(${meta})`);
	}
	return parts.join(" ");
}

export function formatReference(item, bibliography) {
	if (bibliography) {
		return bibliography.trim();
	}
	const bits = [
		item.authorString,
		item.year ? `(${item.year})` : "",
		item.title,
		item.publication,
		item.publisher,
		item.DOI ? `https://doi.org/${item.DOI}` : item.url
	].filter(Boolean);
	return bits.join(". ").replace(/\.\./g, ".");
}

export function formatSummary(item) {
	const lines = [`### ${itemHeadline(item)}`];
	const fields = [
		["Typ", item.itemType],
		["Autor:innen", item.creators.map(c => c.name).filter(Boolean).join("; ")],
		["Jahr", item.year],
		["Veröffentlicht in", item.publication],
		["Verlag", item.publisher],
		["Band/Heft", [item.volume, item.issue].filter(Boolean).join("/")],
		["Seiten", item.pages],
		["Sprache", item.language],
		["DOI", item.DOI],
		["URL", item.url],
		["Schlagwörter", (item.tags || []).join(", ")]
	];
	for (const [label, value] of fields) {
		if (value) {
			lines.push(`- **${label}:** ${value}`);
		}
	}
	if (item.abstract) {
		lines.push("", "**Abstract:**", item.abstract.trim());
	}
	return lines.join("\n");
}

export function formatAbstract(item) {
	if (!item.abstract) {
		return `### ${itemHeadline(item)}\n\n_Für diesen Eintrag ist kein Abstract hinterlegt._`;
	}
	return `### ${itemHeadline(item)}\n\n${item.abstract.trim()}`;
}

export function formatNotes(item, notes) {
	if (!notes || !notes.length) {
		return `### Notizen zu ${itemHeadline(item)}\n\n_Keine Notizen vorhanden._`;
	}
	const lines = [`### Notizen zu ${itemHeadline(item)}`, ""];
	notes.forEach((note, index) => {
		lines.push(`**${index + 1}. ${note.title || "Notiz"}**`);
		lines.push(note.text || "");
		lines.push("");
	});
	return lines.join("\n").trim();
}

export function formatAnnotations(item, annotations) {
	if (!annotations || !annotations.length) {
		return `### Anmerkungen zu ${itemHeadline(item)}\n\n_Keine Anmerkungen im PDF gefunden._`;
	}
	const lines = [`### Anmerkungen zu ${itemHeadline(item)}`, ""];
	for (const annotation of annotations) {
		const page = annotation.page ? ` (S. ${annotation.page})` : "";
		if (annotation.text) {
			lines.push(`> ${annotation.text.replace(/\n+/g, " ").trim()}${page}`);
		}
		if (annotation.comment) {
			lines.push(`  – Kommentar: ${annotation.comment.replace(/\n+/g, " ").trim()}`);
		}
		if (annotation.text || annotation.comment) {
			lines.push("");
		}
	}
	return lines.join("\n").trim();
}

export function formatFullText(item, fulltext) {
	const header = [
		`### Volltext: ${itemHeadline(item)}`,
		"",
		fulltext.truncated
			? `_Gekürzt auf ${fulltext.text.length.toLocaleString("de-DE")} von `
				+ `${fulltext.totalChars.toLocaleString("de-DE")} Zeichen._`
			: `_${fulltext.totalChars.toLocaleString("de-DE")} Zeichen._`,
		"",
		"```text",
		fulltext.text,
		"```"
	];
	return header.join("\n");
}

export function formatCitation(item, citationResult) {
	const entry = (citationResult.inTextCitations || [])
		.find(c => c.key === item.key);
	const inText = entry && entry.citation ? entry.citation.trim() : "";
	const reference = formatReference(item, citationResult.bibliography);

	if (inText) {
		return `${inText} — ${reference}`;
	}
	return reference;
}

export function formatBibliography(items, citationResult) {
	const lines = ["### Literaturverzeichnis", ""];
	if (citationResult && citationResult.bibliography) {
		lines.push(citationResult.bibliography.trim());
	}
	else {
		for (const item of items) {
			lines.push(`- ${formatReference(item)}`);
		}
	}
	return lines.join("\n");
}

export function formatCodeBlock(content, language = "") {
	return "```" + language + "\n" + content.trim() + "\n```";
}

export function wrapForPrompt(title, body) {
	return `${title}\n\n${body}`.trim();
}
