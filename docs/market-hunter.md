# Market Hunter 1.0 — specyfikacja wdrożonego MVP

## Domyślna konfiguracja (zatwierdzona przez użytkownika)
- Liga: Forbidden Rites
- Przedmioty o referencyjnej wartości: **50–200 divine**
- Minimalna przecena ocenianej oferty: **35%**
- Kategoria: **Wszystkie dostępne w legalnym źródle**
- Rarity: w pierwszym etapie tylko dokumentowane kategorie **unique**; wyceny pojedynczych Rare Jewels / rzadkich przedmiotów nie są dostępne w poe.ninja Economy API.

## Wynik testu bezpiecznego dostępu
2026-10-13: na Renderze przeprowadzono pojedynczy sekwencyjny test udokumentowanych endpointów poe.ninja.
- GET /poe2/api/economy/leagues: **HTTP 200**, 6 lig, Forbidden Rites obecna.
- GET /poe2/api/economy/stash/current/item/overview?league=Forbidden%20Rites&type=UniqueWeapons: **HTTP 200**, 148 wierszy.
- GET /poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Currency: **HTTP 200**, 53 wiersze.
- Dane cenowe mają core.primary = divine, HTTP ETag, a API podaje listingCount.
- Nie wykonywano masowego skanowania oficjalnego Trade API ani logowania na konto PoE.

## Funkcje MVP
- /hunter.html — mobilna zakładka Market Hunter, link z głównej wyszukiwarki.
- /api/hunter — zbiorczy, współdzielony odczyt danych referencyjnych bez żadnego parametru wykonującego arbitralne zapytania do źródła.
- Czytelna lista produktów 50–200 div, sortowana od cen najbliższych 100 div, filtrowanie nazw i kategorii.
- Po wybraniu itemu ręczne wprowadzenie znalezionej ceny aukcji w divine.
- Ocena >=35% dyskonta względem ceny referencyjnej; minimum 5 obserwacji do statusu „kandydat”, mniej = „niepewny”.
- Lokalna lista obserwowanych; zapisuje cenę w chwili dodania i alarmuje w interfejsie, jeżeli **referencyjna cena** spadnie o >=35%. Nie jest to alert nowej aukcji ani powiadomienie działające w tle.

## Dane i zasady
- Źródło tylko z dokumentacji https://poe.ninja/docs/api:
  - economy leagues
  - stash item overview typów: UniqueWeapons, UniqueArmours, UniqueAccessories, UniqueFlasks, UniqueCharms, UniqueJewels, UniqueSanctumRelics, UniqueTablets, PrecursorTablets.
- Wysyła identyfikujący User-Agent, respektuje ETag / HTTP 304 i cache co najmniej 60 minut.
- Żądania sekwencyjne z odstępem >=1,7 s, pojedyncze zapytania współdzielone dla wszystkich użytkowników.
- HTTP 429: uhonorowanie Retry-After (lub bezpieczny 60-sekundowy cooldown), przerwanie dalszych odczytów.
- Nie używa niewspieranych endpointów poe.ninja builds/profiles ani nie uruchamia zautomatyzowanych zakupów.
- Nie przelicza automatycznie innych walut na divine bez zweryfikowanego kursu.
- W przypadku niedostępnej kategorii wyniki częściowe są oznaczane, a błędy jawnie widoczne.

## Ograniczenia do późniejszego rozwoju
1. Cena poe.ninja jest **referencyjna**, nie stanowi oferty pojedynczego sprzedawcy ani historycznej transakcji.
2. Bez zgodnego z regulaminem źródła indywidualnych ofert nie można uczciwie obiecać automatycznego wykrywania przecenionych aukcji.
3. Ograniczona liczba unique w przedziale 50–200 div jest poprawnym możliwym wynikiem, nie należy dopisywać fikcyjnych okazji.
4. Rare items, korupcje i rzadkie kombinacje modów wymagają osobnego źródła i porównywania egzemplarzy.
5. Watchlista jest w localStorage tego urządzenia. Powiadomienia Push, zewnętrzne alerty i cykliczny worker wymagają autoryzacji, trwałej bazy i zgodnego źródła danych.
6. Aplikacja jest nieoficjalna, niepowiązana z Grinding Gear Games.

## Testy
- tests/hunter.test.mjs: konfiguracja 50–200 / 35 / all, granice progu, pewność i odrzucanie błędnych wartości.
- Produkcyjny smoke test (2026-10-13): HTTP 200 na /api/hunter, 2 pozycje w przedziale 50–200 div, brak błędów kategorii.
- Flagi RUN_* do jednorazowych prób mają pozostać wyłączone po testach.
