"""Inserta los SVG animados de anim/ dentro de index.html (entre los marcadores ANIMS)."""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent
index = root.parent / 'index.html'
keys = ['skierg', 'sled', 'burpee', 'row', 'lunges', 'wallballs']
anims = {k: (root / f'{k}.svg').read_text(encoding='utf-8').strip() for k in keys}
blob = json.dumps(anims, ensure_ascii=False).replace('</', '<\\/')
html = index.read_text(encoding='utf-8')
html, n = re.subn(r'/\*ANIMS_START\*/.*?/\*ANIMS_END\*/', lambda m: '/*ANIMS_START*/' + blob + '/*ANIMS_END*/', html, flags=re.S)
assert n == 1, 'marcador ANIMS no encontrado'
index.write_text(html, encoding='utf-8')
print('ok', {k: len(v) for k, v in anims.items()})
