from pathlib import Path
import re
p = Path(r'c:\Users\User\Documents\GitHub\tractorbel.rental\documentos.html')
text = p.read_text(encoding='utf-8')
new = re.sub(r'(<a[^>]*target="_blank")(?![^>]*rel=)([^>]*>)', r'\1 rel="noopener noreferrer"\2', text)
if text == new:
    print('no changes')
else:
    print('changed', text.count('target="_blank"'), 'target-blank occurrences; rel count', new.count('rel="noopener noreferrer"'))
    p.write_text(new, encoding='utf-8')
