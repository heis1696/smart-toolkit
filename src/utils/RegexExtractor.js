class RegexExtractor {
    constructor(config = {}) {
        this.patterns = config.patterns || [];
        this.cleanupPatterns = config.cleanupPatterns || [];
    }

    extract(text, pattern) {
        const regex = pattern || (this.patterns.length > 0 ? this.patterns[0].regex : null);
        if (!regex) return null;
        
        const match = text.match(regex);
        if (!match) return null;
        
        return {
            fullMatch: match[0],
            captured: match[1] || null,
            groups: match.groups || null,
            index: match.index
        };
    }

    extractAll(text, pattern) {
        const regex = pattern || (this.patterns.length > 0 ? this.patterns[0].regex : null);
        if (!regex) return [];
        
        const results = [];
        const globalRegex = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
        let match;
        
        while ((match = globalRegex.exec(text)) !== null) {
            results.push({
                fullMatch: match[0],
                captured: match[1] || null,
                groups: match.groups || null,
                index: match.index
            });
        }
        
        return results;
    }

    cleanup(text, patterns) {
        const patternsToUse = patterns || this.cleanupPatterns;
        let result = text;
        
        for (const p of patternsToUse) {
            const regex = typeof p === 'string' ? new RegExp(p, 'gi') : p;
            result = result.replace(regex, '');
        }
        
        return result.trim();
    }

    addPattern(name, pattern, flags = 'gi') {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, flags) : pattern;
        this.patterns.push({ name, regex, source: typeof pattern === 'string' ? pattern : pattern.source });
        return this;
    }

    addCleanupPattern(pattern, flags = 'gi') {
        const regex = typeof pattern === 'string' ? new RegExp(pattern, flags) : pattern;
        this.cleanupPatterns.push(regex);
        return this;
    }

    getPatterns() {
        return this.patterns.map(p => ({
            name: p.name,
            source: p.source
        }));
    }

    getPattern(name) {
        return this.patterns.find(p => p.name === name) || null;
    }

    removePattern(name) {
        const index = this.patterns.findIndex(p => p.name === name);
        if (index !== -1) {
            this.patterns.splice(index, 1);
            return true;
        }
        return false;
    }

    clearPatterns() {
        this.patterns = [];
        return this;
    }

    clearCleanupPatterns() {
        this.cleanupPatterns = [];
        return this;
    }

    static parseBlock(text, tagName, sections = null) {
        const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = text.match(regex);
        if (!match) return null;
        
        const raw = match[1].trim();
        const result = { raw, fullMatch: match[0] };
        
        if (sections && Array.isArray(sections)) {
            for (const sec of sections) {
                const secMatch = raw.match(new RegExp(`<${sec}>([\\s\\S]*?)<\\/${sec}>`, 'i'));
                result[sec] = secMatch ? secMatch[1].trim() : '';
            }
        }
        
        return result;
    }

    static removeBlock(text, tagName) {
        const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'gi');
        return text.replace(regex, '').trim();
    }

    static removeBlocks(text, tagNames) {
        let result = text;
        for (const tag of tagNames) {
            result = RegexExtractor.removeBlock(result, tag);
        }
        return result.trim();
    }

    static extractWithTag(text, tagName) {
        const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = text.match(regex);
        if (!match) return null;
        return {
            content: match[1].trim(),
            fullMatch: match[0],
            index: match.index
        };
    }

    static hasTag(text, tagName) {
        const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'i');
        return regex.test(text);
    }

    static replaceTag(text, tagName, replacement) {
        const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, 'gi');
        return text.replace(regex, replacement);
    }

    static createTag(tagName, content) {
        return `<${tagName}>${content}</${tagName}>`;
    }

    toJSON() {
        return {
            patterns: this.patterns.map(p => ({ name: p.name, source: p.source })),
            cleanupPatterns: this.cleanupPatterns.map(r => r.source)
        };
    }

    static fromJSON(json) {
        const config = typeof json === 'string' ? JSON.parse(json) : json;
        const extractor = new RegexExtractor();
        
        if (config.patterns) {
            for (const p of config.patterns) {
                extractor.addPattern(p.name, p.source);
            }
        }
        
        if (config.cleanupPatterns) {
            for (const p of config.cleanupPatterns) {
                extractor.addCleanupPattern(p);
            }
        }
        
        return extractor;
    }
}

export { RegexExtractor };
export default RegexExtractor;
