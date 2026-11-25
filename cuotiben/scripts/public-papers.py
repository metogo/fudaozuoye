"""Prepare public exam inputs outside the site. Requires curl and pdftotext."""
from pathlib import Path
import argparse
import json
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
root = parser.parse_args().output
root.mkdir(parents=True, exist_ok=True)
base = 'https://www.bca.hkeaa.edu.hk/web/Common/res/2024priPaper/'
papers = {'chi': 'P3Chi/TSA2024_3CR1.pdf', 'eng': 'P3Eng/TSA2024_3ERW1.pdf', 'math': 'P3Math/TSA2024_3MC1.pdf'}
for name, path in papers.items():
    file = root / (name + '.pdf')
    subprocess.run(['curl', '-fsSL', '--max-time', '40', base + path, '-o', str(file)], check=True)
    subprocess.run(['pdftotext', '-layout', str(file), str(file.with_suffix('.txt'))], check=True)

def page(name, n):
    return (root / (name + '.txt')).read_text().split('\f')[n - 1]

def question(text, number, following):
    match = re.search(r'(?ms)^\s*' + str(number) + r'\.\s*(.+?)(?=^\s*' + str(following) + r'\.\s|\Z)', text)
    if not match:
        raise ValueError(f'找不到原卷第 {number} 题')
    body = match[1].split('續後頁')[0].split('2024-TSA')[0]
    return '\n'.join(line.strip() for line in body.splitlines() if line.strip() and '請勿在此書寫' not in line)

def excerpt(text, first, last):
    start = text.index(first)
    return text[start:text.index(last, start) + len(last)]

data = []
def add(subject, number, text, answer):
    data.append(dict(id=f'{subject}-{number}', subject=subject, text=text, reference=answer, paper=base+papers[subject]))

# The accompanying passage is identical across reading items. It is included on every request.
chinese_page = page('chi', 2)
passage = excerpt(chinese_page, '暑假快到了', '十分自豪！')
for n, answer in [(6,'B'), (7,'B'), (8,'A')]:
    add('chi', n, passage + '\n' + question(page('chi',6), n, n+1), answer)
for n, answer in [(4,'835'), (5,'A'), (6,'764')]:
    add('math', n, question(page('math',3), n, n+1), answer)
# For English the advertisement is visual; transcribe its printed facts using the original page layout.
eng = page('eng',2)
ad = excerpt(eng, 'Happy Music School', '2076 4396.')
for n, answer, pg in [(1,'A',2), (2,'B',2), (4,'A',3)]:
    add('eng', n, ad+'\n'+question(page('eng',pg), n, n+1), answer)
(root/'cases.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print('已准备', len(data), '道公开真题，来源与参考答案仅用于验收。')
