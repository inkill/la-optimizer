#!/usr/bin/env python3
"""
Скачивает изображения карт с lil-alchemist.fandom.com и сохраняет их
в public/card-images/ для последующей загрузки на GitHub.

Использование:
    cd public/card-images
    python3 download-images.py

Скрипт читает MANIFEST.json, для каждой карты формирует URL изображения
на wiki CDN (по MD5-хешу имени файла) и скачивает его.

Если изображение не найдено на wiki — пропускает (карта будет показывать
буквенный плейсхолдер).
"""

import json
import hashlib
import os
import sys
import time
import urllib.request
import urllib.error

WIKI = 'lil-alchemist'
CDN = f'https://static.wikia.nocookie.net/{WIKI}/images'

def md5(s):
    return hashlib.md5(s.encode()).hexdigest()

def image_url(card_name):
    """Build the wiki CDN URL for a card image."""
    # Strip ":Onyx" / ":Platinum" suffix — Onyx cards reuse the base image
    base = card_name.split(':')[0]
    filename = f"{base.replace(' ', '_')}.png"
    h = md5(filename)
    prefix = f"{h[0]}/{h[:2]}"
    return f"{CDN}/{prefix}/{filename}/revision/latest/scale-to-width-down/220"

def download(url, dest):
    """Download a URL to a file. Returns True on success."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (LittleAlchemistImageDownloader/1.0)'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return False
            data = resp.read()
            if len(data) < 100:  # too small, probably an error page
                return False
            with open(dest, 'wb') as f:
                f.write(data)
            return True
    except Exception as e:
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    manifest_path = os.path.join(script_dir, 'MANIFEST.json')
    
    if not os.path.exists(manifest_path):
        print(f"ERROR: MANIFEST.json not found at {manifest_path}")
        sys.exit(1)
    
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    
    print(f"Downloading {len(manifest)} card images to {script_dir}/")
    print(f"Source: {CDN}")
    print()
    
    found = 0
    missing = 0
    missing_names = []
    
    for i, entry in enumerate(manifest):
        name = entry['cardName']
        filename = entry['fileName']
        dest = os.path.join(script_dir, filename)
        
        # Skip if already downloaded
        if os.path.exists(dest) and os.path.getsize(dest) > 100:
            found += 1
            continue
        
        url = image_url(name)
        if download(url, dest):
            found += 1
            if found % 20 == 0:
                print(f"  ...{found}/{len(manifest)} downloaded")
        else:
            missing += 1
            missing_names.append(name)
            # Remove empty/partial file
            if os.path.exists(dest):
                os.remove(dest)
        
        # Be polite to the server
        time.sleep(0.05)
    
    print()
    print(f"Done: {found} downloaded, {missing} missing")
    if missing > 0:
        print(f"\nMissing cards (first 20): {', '.join(missing_names[:20])}")
        print("\nFor missing cards, manually save images from:")
        print(f"  https://lil-alchemist.fandom.com/wiki/Special:Search?query=<card_name>")
        print(f"  Save as: public/card-images/<FileName>.png (see MANIFEST.json)")

if __name__ == '__main__':
    main()
