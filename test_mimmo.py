#!/usr/bin/env python3
"""
Quick test for MIMMO profile to verify the fix works across all profiles
"""

import requests

BASE_URL = "https://language-check-10.preview.emergentagent.com/api"
USER_ID = "3b633bd5-12ae-4050-9393-9e842df662c5"

def test_rocco_profile():
    print("=" * 60)
    print("QUICK TEST FOR MIMMO PROFILE")
    print("=" * 60)
    
    # Get user data
    response = requests.get(f"{BASE_URL}/users/{USER_ID}")
    user_data = response.json()
    profili_figli = user_data.get("profili_figli", [])
    
    # Find rocco
    rocco_profile = None
    for profilo in profili_figli:
        nome = profilo.get("nome_figlio", "").upper()
        if "ROCCO" in nome:
            rocco_profile = profilo
            break
    
    if not rocco_profile:
        print("❌ rocco profile not found")
        return False
    
    rocco_id = rocco_profile.get("id")
    rocco_nome = rocco_profile.get("nome_figlio")
    rocco_classe = rocco_profile.get("classe")
    
    print(f"✅ Found rocco: {rocco_nome} (Class: {rocco_classe}, ID: {rocco_id})")
    
    # Test compatibility endpoint
    comp_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{rocco_id}/compatibility")
    if comp_resp.status_code != 200:
        print(f"❌ Compatibility endpoint failed: {comp_resp.status_code}")
        return False
    
    comp_data = comp_resp.json()
    radar_vendibili = comp_data.get("vendere", {}).get("libri_vendibili", [])
    
    # Test books-to-sell endpoint
    bts_resp = requests.get(f"{BASE_URL}/profiles/{USER_ID}/children/{rocco_id}/books-to-sell")
    if bts_resp.status_code != 200:
        print(f"❌ Books-to-sell endpoint failed: {bts_resp.status_code}")
        return False
    
    bts_data = bts_resp.json()
    books_to_sell = bts_data.get("books", [])
    
    print(f"📊 Results:")
    print(f"   - Radar vendibili: {len(radar_vendibili)}")
    print(f"   - Books-to-sell: {len(books_to_sell)}")
    
    # Compare
    radar_isbns = {libro.get('isbn') for libro in radar_vendibili if libro.get('isbn')}
    bts_isbns = {libro.get('isbn') for libro in books_to_sell if libro.get('isbn')}
    
    if radar_isbns == bts_isbns:
        print("✅ PERFECT ALIGNMENT for rocco!")
        return True
    else:
        print("❌ MISALIGNMENT detected for rocco")
        print(f"   - Only in radar: {radar_isbns - bts_isbns}")
        print(f"   - Only in books-to-sell: {bts_isbns - radar_isbns}")
        return False

if __name__ == "__main__":
    success = test_rocco_profile()
    print(f"\nResult: {'✅ SUCCESS' if success else '❌ FAILED'}")