import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('<script type="module">') + len('<script type="module">')
end = content.rfind('</script>')
js = content[start:end]

ids_in_js = re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js)
print('IDs referenced in JS:')
for i in ids_in_js:
    print(' ', i)

# Check which ones are missing from HTML
print('\nMissing from HTML:')
for i in ids_in_js:
    if f'id="{i}"' not in content and f"id='{i}'" not in content:
        print('  MISSING:', i)
