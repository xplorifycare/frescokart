/* FrescoKart /join: the waiting list for all of Kerala. Talks to /api/d/ (see server/demand.py) and reads the place list
   from /join/data/places.json (made by build_places.py from the Department of Posts PIN directory).
   Town links like /join/thrissur, /join/edappally or /join/682024 open this same page with that place picked.
   Remembers the visitor's own sign-up in localStorage ("fkj-lead"), so coming back shows their place, not the form. */
(function () {
  "use strict";

  var T = {
    en: {
      coming_kerala: "Coming soon across Kerala", coming_to: "Coming soon to {name}",
      h1_customer: "Fresh fish, meat and vegetables from shops near you. At your door.",
      lede_customer: "We're starting place by place. The places with the most homes on the list go first.",
      h1_shop: "Get orders from the homes around your shop.",
      lede_shop: "We bring the customers and the delivery. Registering is free.",
      h1_rider: "Deliver in your own area. Pick your hours.",
      lede_rider: "Short local trips. Register now and we'll call you before we start.",
      s1: "I am a", r_customer: "Customer", r_shop: "Shop owner", r_rider: "Delivery rider",
      s2: "Where do you live?", pin_ph: "PIN code, e.g. 682024",
      no_pin: "Don't know your PIN? Choose district and place", choose_d: "Choose your district",
      place_ph: "Type your place", pin_bad: "We couldn't find this PIN code in Kerala. Check it, or choose your district below.",
      pin_which: "Which one is your place?", other_place: "Somewhere else", other_place_q: "Name of your place",
      use_typed: "Use “{q}”", change: "Change",
      area_sub: "{area} area · PIN {pin} · {district}", typed_sub: "{district} · we'll add your place",
      unit_customer: "homes", unit_shop: "shops", unit_rider: "riders",
      rank: "#{rank} in Kerala right now", rank0: "Be the first in this area!",
      s3: "My WhatsApp number", name_ph: "Your name (optional)",
      consent: "Send me updates on WhatsApp about FrescoKart in my area. I can stop anytime.", privacy: "Privacy",
      cta_customer: "Join the list", cta_shop: "Register my shop", cta_rider: "Register as a rider",
      fine: "No app, no OTP. Reply STOP anytime.", sending: "Saving…",
      e_phone: "Enter a 10-digit mobile number.", e_area: "Tell us where you live.", e_place: "Type the name of your place.",
      e_consent: "Tick the box so we can message you.", e_net: "Couldn't reach us. Check your internet and try again.",
      e_rate: "Too many tries. Please wait a while and try again.", e_save: "Couldn't save. Try again.",
      already_t: "This number is already on the list 👍",
      already_s: "We'll keep you posted on WhatsApp. Tell your neighbours about FrescoKart too.",
      d_cust: "You're #{n} in {area}", d_cust_sub: "{count} homes in {area} have joined so far.", d_cust_sub1: "You're the first home in {area}!",
      d_rank: "{area} is #{rank} in Kerala right now.",
      d_other: "Thanks! We'll tell you when we reach {area}.", d_other_cnt: "{count} people from {area} have joined.", d_other_cnt1: "You're the first from {area}.",
      d_shop: "Your shop is on the list for {area}", d_shop_sub: "We'll call you to visit your shop and explain how it works.",
      d_rider: "You're registered as a rider for {area}", d_rider_sub: "We'll call you before we start, to explain shifts and pay.",
      left: "{r} more homes and {area} is ready for FrescoKart.",
      reached: "{area} has reached its goal! We'll message you about the start date.",
      share_btn_customer: "Share with neighbours", share_btn_shop: "Share with other shops", share_btn_rider: "Share with friends",
      copy: "Copy link", copied: "Link copied",
      brought: "{n} people joined with your link. Thank you!", brought1: "1 person joined with your link. Thank you!",
      brought0: "Everyone who joins with your link moves {area} up the list.",
      share_customer: "I've joined FrescoKart's list for {area}: fresh fish, meat and vegetables from our nearby shops, delivered home. The more homes join, the sooner it starts here. Join: {link}",
      share_shop: "FrescoKart is bringing orders from nearby homes to local shops in {area}. Register your shop: {link}",
      share_rider: "FrescoKart is looking for delivery riders in {area}. Short local trips, pick your hours. Register: {link}",
      share_generic: "FrescoKart is coming to Kerala: fresh fish, meat and vegetables from nearby shops, delivered home. Join the list for your place: {link}",
      group_customer: "Join the {area} WhatsApp group", group_shop: "Join the shop owners' WhatsApp group",
      group_rider: "Join the riders' WhatsApp group", msg_us: "Say hi to us on WhatsApp",
      save_no: "Save our number so our updates reach you.", group_hint: "Updates about {area}, one message a day at most.",
      hi_msg: "Hi FrescoKart! I just joined the list for {area}.",
      m_title: "Help us start right", m_sub: "30 seconds. Everything here is optional.",
      q_buys: "What do you usually buy?",
      b_fish: "Fish", b_chicken: "Chicken", b_mutton: "Mutton", b_beef: "Beef", b_vegetables: "Vegetables",
      b_fruits: "Fruits", b_groceries: "Groceries", b_eggs: "Eggs",
      q_often: "How often do you buy fish or meat?",
      o_daily: "Daily", o_few: "2–3 times a week", o_weekly: "Once a week", o_sometimes: "Now and then",
      q_shops: "Which nearby shops do you buy from? We'll try to bring them on.", shop_name_ph: "Shop name",
      k_fish: "Fish", k_meat: "Meat", k_veg: "Vegetables", k_grocery: "Grocery", k_other: "Other",
      add_shop: "+ Add another shop",
      q_flat: "Your flat or street", flat_ph: "e.g. Green Park Flats, Church Road",
      q_week: "Would you order in our first week?", w_yes: "Yes, for sure", w_maybe: "Maybe", w_no: "Not yet",
      q_shopname: "Shop name", q_sells: "What do you sell?", q_delivers: "Do you deliver to homes now?",
      yes: "Yes", no: "No", q_visit: "Best time for us to visit your shop",
      t_morning: "Morning", t_afternoon: "Afternoon", t_evening: "Evening",
      q_vehicle: "Your vehicle", v_scooter: "Scooter", v_bike: "Motorbike", v_none: "No vehicle yet",
      q_licence: "Two-wheeler licence?", q_times: "When can you ride?",
      rt_morning: "Morning 6–11", rt_afternoon: "Afternoon 11–4", rt_evening: "Evening 4–9",
      save: "Save answers", saved: "Thank you! We'll keep you posted.",
      again: "Sign up another number",
      race_t: "Which place gets FrescoKart first?", race_s: "Top places in Kerala right now",
      race_empty: "Nobody on the board yet. Put your place there first!", all_d: "All districts",
      how_t: "How it works", how1: "Join the list for your place.",
      how2: "Share your link with neighbours. Your place moves up.",
      how3: "When a place reaches its goal, we start there and tell you first on WhatsApp.",
      f_wa: "WhatsApp us", f_privacy: "Privacy"
    },
    ml: {
      coming_kerala: "കേരളത്തിൽ ഉടൻ", coming_to: "ഉടൻ വരുന്നു: {name}",
      h1_customer: "അടുത്തുള്ള കടകളിലെ മീൻ, ഇറച്ചി, പച്ചക്കറി — ഇനി വീട്ടുപടിക്കൽ.",
      lede_customer: "ഓരോ സ്ഥലത്തായാണ് ഞങ്ങൾ തുടങ്ങുന്നത്. കൂടുതൽ വീടുകൾ ചേരുന്ന സ്ഥലത്ത് ആദ്യം.",
      h1_shop: "നിങ്ങളുടെ കടയ്ക്ക് ചുറ്റുമുള്ള വീടുകളിൽ നിന്ന് ഓർഡറുകൾ.",
      lede_shop: "കസ്റ്റമറെയും ഡെലിവറിയും ഞങ്ങൾ എത്തിക്കാം. രജിസ്റ്റർ ചെയ്യാൻ ഫീസില്ല.",
      h1_rider: "സ്വന്തം ഏരിയയിൽ ഡെലിവറി. സമയം നിങ്ങളുടേത്.",
      lede_rider: "ചെറിയ ലോക്കൽ ട്രിപ്പുകൾ. ഇപ്പോൾ രജിസ്റ്റർ ചെയ്യൂ, തുടങ്ങും മുൻപ് ഞങ്ങൾ വിളിക്കാം.",
      s1: "നിങ്ങൾ ആരാണ്?", r_customer: "കസ്റ്റമർ", r_shop: "കടയുടമ", r_rider: "ഡെലിവറി റൈഡർ",
      s2: "നിങ്ങൾ എവിടെയാണ് താമസം?", pin_ph: "പിൻ കോഡ്, ഉദാ: 682024",
      no_pin: "പിൻ കോഡ് അറിയില്ലേ? ജില്ലയും സ്ഥലവും തിരഞ്ഞെടുക്കൂ", choose_d: "ജില്ല തിരഞ്ഞെടുക്കൂ",
      place_ph: "സ്ഥലത്തിന്റെ പേര് ഇംഗ്ലീഷിൽ ടൈപ്പ് ചെയ്യൂ", pin_bad: "ഈ പിൻ കോഡ് കേരളത്തിൽ കണ്ടില്ല. പരിശോധിക്കൂ, അല്ലെങ്കിൽ താഴെ ജില്ല തിരഞ്ഞെടുക്കൂ.",
      pin_which: "ഇതിൽ ഏതാണ് നിങ്ങളുടെ സ്ഥലം?", other_place: "മറ്റൊരു സ്ഥലം", other_place_q: "സ്ഥലത്തിന്റെ പേര്",
      use_typed: "“{q}” ചേർക്കൂ", change: "മാറ്റുക",
      area_sub: "{area} ഏരിയ · പിൻ {pin} · {district}", typed_sub: "{district} · നിങ്ങളുടെ സ്ഥലം ഞങ്ങൾ ചേർക്കാം",
      unit_customer: "വീടുകൾ", unit_shop: "കടകൾ", unit_rider: "റൈഡർമാർ",
      rank: "കേരളത്തിൽ ഇപ്പോൾ #{rank}", rank0: "ഈ ഏരിയയിൽ ആദ്യം ചേരൂ!",
      s3: "വാട്സ്ആപ്പ് നമ്പർ", name_ph: "പേര് (നിർബന്ധമില്ല)",
      consent: "എന്റെ ഏരിയയിലെ FrescoKart വിവരങ്ങൾ വാട്സ്ആപ്പിൽ അയക്കാം. എപ്പോൾ വേണമെങ്കിലും നിർത്താം.", privacy: "സ്വകാര്യതാ നയം",
      cta_customer: "ലിസ്റ്റിൽ ചേരൂ", cta_shop: "കട രജിസ്റ്റർ ചെയ്യൂ", cta_rider: "റൈഡറായി രജിസ്റ്റർ ചെയ്യൂ",
      fine: "ആപ്പ് വേണ്ട, OTP വേണ്ട. STOP എന്ന് അയച്ചാൽ മെസേജുകൾ നിർത്താം.", sending: "സേവ് ചെയ്യുന്നു…",
      e_phone: "10 അക്ക മൊബൈൽ നമ്പർ നൽകൂ.", e_area: "താമസസ്ഥലം നൽകൂ.", e_place: "സ്ഥലത്തിന്റെ പേര് എഴുതൂ.",
      e_consent: "മെസേജ് അയക്കാൻ ബോക്സിൽ ടിക്ക് ചെയ്യൂ.", e_net: "കണക്ഷൻ കിട്ടിയില്ല. ഇന്റർനെറ്റ് നോക്കി വീണ്ടും ശ്രമിക്കൂ.",
      e_rate: "ഒരുപാട് ശ്രമങ്ങൾ. കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.", e_save: "സേവ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.",
      already_t: "ഈ നമ്പർ ഇതിനകം ലിസ്റ്റിലുണ്ട് 👍",
      already_s: "വിവരങ്ങൾ വാട്സ്ആപ്പിൽ അറിയിക്കാം. അയൽക്കാർക്കും FrescoKart പരിചയപ്പെടുത്തൂ.",
      d_cust: "{area} ലിസ്റ്റിൽ നിങ്ങളുടെ നമ്പർ #{n}", d_cust_sub: "{area} ലിസ്റ്റിൽ ഇതുവരെ {count} വീടുകൾ.", d_cust_sub1: "{area} ലിസ്റ്റിൽ ആദ്യത്തെ വീട് നിങ്ങളുടേതാണ്!",
      d_rank: "കേരളത്തിൽ ഇപ്പോൾ {area} #{rank} സ്ഥാനത്ത്.",
      d_other: "നന്ദി! {area} ഏരിയയിൽ എത്തുമ്പോൾ ഞങ്ങൾ അറിയിക്കാം.", d_other_cnt: "{area} ഏരിയയിൽ നിന്ന് {count} പേർ ചേർന്നു.", d_other_cnt1: "{area} ഏരിയയിൽ നിന്ന് ആദ്യം ചേർന്നത് നിങ്ങളാണ്.",
      d_shop: "{area} ലിസ്റ്റിൽ നിങ്ങളുടെ കട ചേർത്തു", d_shop_sub: "കട സന്ദർശിച്ച് വിശദമായി പറയാൻ ഞങ്ങൾ വിളിക്കാം.",
      d_rider: "{area} ഏരിയയിൽ റൈഡറായി രജിസ്റ്റർ ചെയ്തു", d_rider_sub: "തുടങ്ങും മുൻപ് ഷിഫ്റ്റും പേയ്‌മെന്റും വിശദീകരിക്കാൻ ഞങ്ങൾ വിളിക്കാം.",
      left: "{r} വീടുകൾ കൂടി ചേർന്നാൽ {area} FrescoKart-ന് റെഡി.",
      reached: "{area} ലക്ഷ്യം കടന്നു! തുടങ്ങുന്ന തീയതി ഞങ്ങൾ അറിയിക്കാം.",
      share_btn_customer: "അയൽക്കാർക്ക് അയക്കൂ", share_btn_shop: "മറ്റ് കടക്കാർക്കും അയക്കൂ", share_btn_rider: "കൂട്ടുകാർക്ക് അയക്കൂ",
      copy: "ലിങ്ക് കോപ്പി", copied: "കോപ്പി ചെയ്തു",
      brought: "നിങ്ങളുടെ ലിങ്കിലൂടെ {n} പേർ ചേർന്നു. നന്ദി!", brought1: "നിങ്ങളുടെ ലിങ്കിലൂടെ ഒരാൾ ചേർന്നു. നന്ദി!",
      brought0: "നിങ്ങളുടെ ലിങ്കിലൂടെ ചേരുന്ന ഓരോരുത്തരും {area} ഏരിയയെ മുന്നിലെത്തിക്കും.",
      share_customer: "ഞാൻ FrescoKart-ന്റെ {area} ലിസ്റ്റിൽ ചേർന്നു: അടുത്തുള്ള കടകളിലെ മീൻ, ഇറച്ചി, പച്ചക്കറി വീട്ടിലെത്തിക്കും. കൂടുതൽ വീടുകൾ ചേർന്നാൽ നമ്മുടെ ഏരിയയിൽ വേഗം തുടങ്ങും. ഇവിടെ ചേരൂ: {link}",
      share_shop: "{area} ഏരിയയിലെ കടകൾക്ക് അടുത്തുള്ള വീടുകളിൽ നിന്ന് ഓർഡറുകൾ എത്തിക്കാൻ FrescoKart വരുന്നു. നിങ്ങളുടെ കട രജിസ്റ്റർ ചെയ്യൂ: {link}",
      share_rider: "{area} ഏരിയയിൽ FrescoKart ഡെലിവറി റൈഡർമാരെ തേടുന്നു. ചെറിയ ലോക്കൽ ട്രിപ്പുകൾ, സമയം നമുക്ക് തിരഞ്ഞെടുക്കാം. രജിസ്റ്റർ ചെയ്യൂ: {link}",
      share_generic: "FrescoKart കേരളത്തിലേക്ക് വരുന്നു: അടുത്തുള്ള കടകളിലെ മീൻ, ഇറച്ചി, പച്ചക്കറി വീട്ടിലെത്തിക്കും. നിങ്ങളുടെ സ്ഥലത്തിന്റെ ലിസ്റ്റിൽ ചേരൂ: {link}",
      group_customer: "{area} വാട്സ്ആപ്പ് ഗ്രൂപ്പിൽ ചേരൂ", group_shop: "കടയുടമകളുടെ വാട്സ്ആപ്പ് ഗ്രൂപ്പിൽ ചേരൂ",
      group_rider: "റൈഡർമാരുടെ വാട്സ്ആപ്പ് ഗ്രൂപ്പിൽ ചേരൂ", msg_us: "വാട്സ്ആപ്പിൽ ഹായ് പറയൂ",
      save_no: "അപ്ഡേറ്റുകൾ കിട്ടാൻ ഞങ്ങളുടെ നമ്പർ സേവ് ചെയ്യൂ.", group_hint: "{area} വിവരങ്ങൾ, ദിവസം പരമാവധി ഒരു മെസേജ്.",
      hi_msg: "ഹായ് FrescoKart! ഞാൻ {area} ലിസ്റ്റിൽ ചേർന്നു.",
      m_title: "ശരിയായി തുടങ്ങാൻ സഹായിക്കൂ", m_sub: "30 സെക്കൻഡ്. എല്ലാം നിർബന്ധമില്ല.",
      q_buys: "സാധാരണ എന്തൊക്കെ വാങ്ങാറുണ്ട്?",
      b_fish: "മീൻ", b_chicken: "ചിക്കൻ", b_mutton: "മട്ടൻ", b_beef: "ബീഫ്", b_vegetables: "പച്ചക്കറി",
      b_fruits: "പഴങ്ങൾ", b_groceries: "പലചരക്ക്", b_eggs: "മുട്ട",
      q_often: "മീനോ ഇറച്ചിയോ എത്ര തവണ വാങ്ങും?",
      o_daily: "ദിവസവും", o_few: "ആഴ്ചയിൽ 2–3 തവണ", o_weekly: "ആഴ്ചയിലൊരിക്കൽ", o_sometimes: "വല്ലപ്പോഴും",
      q_shops: "ഏതൊക്കെ കടകളിൽ നിന്നാണ് വാങ്ങാറ്? അവരെ കൊണ്ടുവരാൻ ഞങ്ങൾ ശ്രമിക്കാം.", shop_name_ph: "കടയുടെ പേര്",
      k_fish: "മീൻ", k_meat: "ഇറച്ചി", k_veg: "പച്ചക്കറി", k_grocery: "പലചരക്ക്", k_other: "മറ്റുള്ളവ",
      add_shop: "+ മറ്റൊരു കട",
      q_flat: "ഫ്ലാറ്റ് / സ്ട്രീറ്റ്", flat_ph: "ഉദാ: ഗ്രീൻ പാർക്ക് ഫ്ലാറ്റ്, ചർച്ച് റോഡ്",
      q_week: "ആദ്യ ആഴ്ചയിൽ തന്നെ ഓർഡർ ചെയ്യുമോ?", w_yes: "ഉറപ്പായും", w_maybe: "ചിലപ്പോൾ", w_no: "ഇപ്പോൾ ഇല്ല",
      q_shopname: "കടയുടെ പേര്", q_sells: "എന്താണ് വിൽക്കുന്നത്?", q_delivers: "ഇപ്പോൾ വീടുകളിൽ ഡെലിവറി ചെയ്യുന്നുണ്ടോ?",
      yes: "ഉണ്ട്", no: "ഇല്ല", q_visit: "കടയിൽ വരാൻ പറ്റിയ സമയം",
      t_morning: "രാവിലെ", t_afternoon: "ഉച്ചയ്ക്ക്", t_evening: "വൈകിട്ട്",
      q_vehicle: "നിങ്ങളുടെ വാഹനം", v_scooter: "സ്കൂട്ടർ", v_bike: "ബൈക്ക്", v_none: "വാഹനമില്ല",
      q_licence: "ടൂവീലർ ലൈസൻസ് ഉണ്ടോ?", q_times: "എപ്പോൾ റൈഡ് ചെയ്യാം?",
      rt_morning: "രാവിലെ 6–11", rt_afternoon: "ഉച്ച 11–4", rt_evening: "വൈകിട്ട് 4–9",
      save: "സേവ് ചെയ്യൂ", saved: "നന്ദി! വിവരങ്ങൾ ഞങ്ങൾ അറിയിക്കാം.",
      again: "മറ്റൊരു നമ്പർ ചേർക്കൂ",
      race_t: "FrescoKart ആദ്യം എവിടെ?", race_s: "ഇപ്പോൾ കേരളത്തിൽ മുന്നിലുള്ള സ്ഥലങ്ങൾ",
      race_empty: "ബോർഡിൽ ഇതുവരെ ആരുമില്ല. നിങ്ങളുടെ സ്ഥലം ആദ്യം എത്തിക്കൂ!", all_d: "എല്ലാ ജില്ലകളും",
      how_t: "എങ്ങനെ?", how1: "നിങ്ങളുടെ സ്ഥലത്തിന്റെ ലിസ്റ്റിൽ ചേരൂ.",
      how2: "ലിങ്ക് അയൽക്കാർക്ക് അയക്കൂ. നിങ്ങളുടെ സ്ഥലം മുന്നിലെത്തും.",
      how3: "ലക്ഷ്യം എത്തുന്ന സ്ഥലത്ത് ഞങ്ങൾ തുടങ്ങും, ആദ്യം നിങ്ങളെ വാട്സ്ആപ്പിൽ അറിയിക്കും.",
      f_wa: "വാട്സ്ആപ്പ്", f_privacy: "സ്വകാര്യത"
    }
  };

  var ROLES = ["customer", "shop", "rider"];
  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var qs = new URLSearchParams(location.search);

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // where the visitor came from: kept for the whole visit, even if they reload without the query
  var attr = (function () {
    var saved = null;
    try { saved = JSON.parse(ssGet("fkj-attr") || "null"); } catch (e) {}
    var utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) { if (qs.get(k)) utm[k] = qs.get(k); });
    var fresh = { src: qs.get("src") || "", ref: (qs.get("ref") || "").toUpperCase(), utm: utm };
    var a = (fresh.src || fresh.ref || Object.keys(utm).length || !saved) ? fresh : saved;
    ssSet("fkj-attr", JSON.stringify(a));
    return a;
  })();

  var slugMatch = location.pathname.match(/^\/join\/([a-z0-9-]+)\/?$/);
  var langQ = qs.get("lang");
  var state = {
    lang: (langQ === "ml" || langQ === "en") ? langQ : (lsGet("fkj-lang") || "en"),
    role: ROLES.indexOf(qs.get("role")) >= 0 ? qs.get("role") : "customer",
    loc: null,          // {district, pin, place, typed}
    preDistrict: "",    // a district link (/join/thrissur) picks the district and lets them choose the place
    pillName: "",
    board: null, zmap: {},
    lead: null, sending: false
  };

  function t(key, vars) {
    var s = T[state.lang][key];
    if (s == null) s = T.en[key];
    if (s == null) s = key;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function api(path, body) {
    var opt = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-FK": "1" }, body: JSON.stringify(body) } : {};
    return fetch("/api/d/" + path, opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "server" }; }).then(function (j) { j._status = r.status; return j; });
    });
  }

  // ---------- Kerala places ----------
  var IDX = null, placesReady = null;
  function ensurePlaces() {
    if (!placesReady) placesReady = fetch("/join/data/places.json").then(function (r) { return r.json(); }).then(function (P) {
      IDX = { districts: [], dById: {}, zoneByPin: {}, zoneBySlug: {}, placesByZone: {}, placesByDistrict: {} };
      P.districts.forEach(function (d) { var o = { id: d[0], name: d[1], ml: d[2] }; IDX.districts.push(o); IDX.dById[d[0]] = o; });
      var zones = P.zones.map(function (z) { var o = { name: z[0], pin: z[1], d: P.districts[z[2]][0], slug: z[3] }; IDX.zoneByPin[o.pin] = o; IDX.zoneBySlug[o.slug] = o; return o; });
      P.places.forEach(function (p) {
        var z = zones[p[1]], o = { name: p[0], pin: z.pin, d: P.districts[p[2]][0] };
        (IDX.placesByZone[z.pin] = IDX.placesByZone[z.pin] || []).push(o);
        (IDX.placesByDistrict[o.d] = IDX.placesByDistrict[o.d] || []).push(o);
      });
    });
    return placesReady;
  }
  function dName(id) { var d = IDX && IDX.dById[id]; return d ? (state.lang === "ml" ? d.ml : d.name) : ""; }
  function zoneName(pin) { var z = IDX && IDX.zoneByPin[pin]; return z ? z.name : ""; }

  function targetFor(role, pin) {
    var b = state.board;
    if (!b || !pin) return null;
    if (role === "shop") return b.shop_target;
    if (role === "rider") return b.rider_target;
    return (b.targets && b.targets[pin]) || b.default_target;
  }
  function countFor(role, pin) { var z = state.zmap[pin]; return z ? z[3 + ROLES.indexOf(role)] : 0; }  // [pin, name, district, customers, shops, riders]
  function rankFor(pin) {
    var mine = countFor("customer", pin);
    if (!mine) return 0;
    return 1 + ((state.board && state.board.zones) || []).filter(function (z) { return z[3] > mine; }).length;
  }

  // ---------- text ----------
  function applyText() {
    document.documentElement.lang = state.lang;
    document.body.classList.toggle("is-ml", state.lang === "ml");
    qsa("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang)); });
    qsa("[data-t]").forEach(function (el) { el.textContent = t(el.dataset.t); });
    qsa("[data-ph]").forEach(function (el) { el.placeholder = t(el.dataset.ph); });
    $("h1").textContent = t("h1_" + state.role);
    $("lede").textContent = t("lede_" + state.role);
    $("pill").textContent = state.pillName ? t("coming_to", { name: state.pillName }) : t("coming_kerala");
    $("submit").textContent = state.sending ? t("sending") : t("cta_" + state.role);
    document.title = state.lang === "ml" ? "FrescoKart: നിങ്ങളുടെ സ്ഥലത്തിന്റെ ലിസ്റ്റിൽ ചേരൂ" : "FrescoKart: join the list for your place";
    fillDistricts();
    renderLoc();
    renderRace();
    if (state.lead) { showDone(); renderMore(); }
  }

  function syncOn() {
    qsa(".role").forEach(function (l) { var i = l.querySelector("input"); l.classList.toggle("on", !!(i && i.checked)); });
  }

  // ---------- where you live ----------
  function fillDistricts() {
    if (!IDX) return;
    var sel = $("district"), cur = sel.value || state.preDistrict;
    sel.innerHTML = '<option value="">' + esc(t("choose_d")) + "</option>" + IDX.districts.map(function (d) {
      return '<option value="' + d.id + '">' + esc(state.lang === "ml" ? d.ml + " · " + d.name : d.name) + "</option>";
    }).join("");
    sel.value = cur || "";
    $("placeWrap").hidden = !sel.value;
  }

  function showDistrictPicker(focus) {
    ensurePlaces().then(function () {
      $("byDistrict").hidden = false; $("noPin").hidden = true;
      fillDistricts();
      if (focus) ($("district").value ? $("placeQ") : $("district")).focus();
    });
  }

  function onPin(pin) {
    ensurePlaces().then(function () {
      var z = IDX.zoneByPin[pin], box = $("pinBox"), msg = $("pinMsg");
      box.hidden = false; $("pinOther").hidden = true; $("pinOther").value = "";
      if (!z) {
        msg.textContent = t("pin_bad"); msg.classList.add("bad"); $("pinPlaces").innerHTML = "";
        showDistrictPicker(false);
        return;
      }
      msg.classList.remove("bad");
      var list = (IDX.placesByZone[pin] || []).slice().sort(function (a, b) { return (a.name === z.name ? -1 : 0) - (b.name === z.name ? -1 : 0) || a.name.localeCompare(b.name); });
      if (list.length === 1) { choose({ district: list[0].d, pin: pin, place: list[0].name }); return; }
      msg.textContent = t("pin_which");
      $("pinPlaces").innerHTML = list.map(function (p, i) { return '<button type="button" class="chip" data-pick="' + i + '">' + esc(p.name) + "</button>"; }).join("") +
        '<button type="button" class="chip" data-pick="other">' + esc(t("other_place")) + "</button>";
      $("pinPlaces").onclick = function (e) {
        var b = e.target.closest("[data-pick]");
        if (!b) return;
        if (b.dataset.pick === "other") { $("pinOther").hidden = false; $("pinOther").focus(); return; }
        var p = list[+b.dataset.pick];
        choose({ district: p.d, pin: pin, place: p.name });
      };
    });
  }

  function placeMatches(d, q) {
    // postal spellings differ from everyday ones (Edapally / Edappally), so compare without spaces and doubled letters
    var norm = function (x) { return x.toLowerCase().replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1"); };
    var all = (IDX.placesByDistrict[d] || []), lq = norm(q), starts = [], has = [];
    for (var i = 0; i < all.length && starts.length < 8; i++) {
      var n = norm(all[i].name);
      if (n.indexOf(lq) === 0) starts.push(all[i]); else if (n.indexOf(lq) > 0) has.push(all[i]);
    }
    return starts.concat(has).slice(0, 8);
  }

  function renderPlaceList() {
    var d = $("district").value, q = $("placeQ").value.trim(), box = $("placeList");
    if (!d || q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    var found = placeMatches(d, q), exact = found.some(function (p) { return p.name.toLowerCase() === q.toLowerCase(); });
    box.innerHTML = found.map(function (p, i) {
      return '<button type="button" data-i="' + i + '"><span>' + esc(p.name) + "</span><small>" + p.pin + "</small></button>";
    }).join("") + (exact ? "" : '<button type="button" class="typed" data-i="typed"><span>' + esc(t("use_typed", { q: q })) + "</span></button>");
    box.hidden = false;
    box.onclick = function (e) {
      var b = e.target.closest("[data-i]");
      if (!b) return;
      if (b.dataset.i === "typed") choose({ district: d, pin: "", place: q, typed: true });
      else { var p = found[+b.dataset.i]; choose({ district: p.d, pin: p.pin, place: p.name }); }
    };
  }

  function choose(loc) {
    state.loc = loc;
    if (loc.pin) state.pillName = zoneName(loc.pin) || loc.place;
    showErr("e_area", null);
    applyText();
  }

  function renderLoc() {
    var L = state.loc;
    $("locPick").hidden = !!L;
    $("locChosen").hidden = !L;
    if (!L) return;
    $("locName").textContent = L.place;
    $("locSub").textContent = L.pin ? t("area_sub", { area: zoneName(L.pin) || L.place, pin: L.pin, district: dName(L.district) })
      : t("typed_sub", { district: dName(L.district) });
    var target = targetFor(state.role, L.pin), meter = $("locMeter");
    meter.hidden = !target;
    if (target) {
      var n = countFor(state.role, L.pin);
      meter.querySelector("i").style.width = Math.min(100, Math.round(n / target * 100)) + "%";
      $("locCnt").textContent = n + " / " + target + " " + t("unit_" + state.role);
    }
    var rank = L.pin ? rankFor(L.pin) : null;
    $("locRank").textContent = state.role !== "customer" || rank === null ? "" : rank ? t("rank", { rank: rank }) : t("rank0");
  }

  function resetLoc() {
    state.loc = null;
    $("pin").value = ""; $("pinBox").hidden = true; $("pinOther").hidden = true; $("pinOther").value = "";
    $("placeQ").value = ""; $("placeList").hidden = true;
    applyText();
    $("pin").focus();
  }

  // ---------- the Kerala race ----------
  function renderRace() {
    var b = state.board, list = $("raceList");
    if (!b) return;
    var top = b.zones.filter(function (z) { return z[3] > 0; }).slice(0, 10);  // the race is about homes
    list.innerHTML = top.length ? top.map(function (z, i) {
      var target = (b.targets && b.targets[z[0]]) || b.default_target, pct = Math.min(100, Math.round(z[3] / target * 100));
      return '<li' + (state.loc && state.loc.pin === z[0] ? ' class="me"' : "") + '><span class="rk">' + (i + 1) + '</span><span class="nm"><b>' + esc(z[1]) + "</b><small>" +
        esc(dName(z[2]) || z[2]) + " · " + z[0] + '</small></span><span class="meter"><span class="bar"><i style="width:' + pct + '%"></i></span><span class="cnt mono">' +
        z[3] + " / " + target + "</span></span></li>";
    }).join("") : '<li class="empty-race">' + esc(t("race_empty")) + "</li>";
    if (!IDX) return;
    var rows = IDX.districts.map(function (d) { return { d: d, n: (b.districts[d.id] || [0])[0] }; }).sort(function (a, c) { return c.n - a.n; });
    var max = Math.max(1, rows[0] ? rows[0].n : 1);
    $("distList").innerHTML = rows.map(function (r) {
      return '<div class="distrow"><span>' + esc(state.lang === "ml" ? r.d.ml : r.d.name) + '</span><span class="bar"><i style="width:' + Math.round(r.n / max * 100) + '%"></i></span><span class="n">' + r.n + "</span></div>";
    }).join("");
  }

  function loadBoard() {
    return api("board").then(function (j) {
      if (!j.ok) return;
      state.board = j; state.zmap = {};
      j.zones.forEach(function (z) { state.zmap[z[0]] = z; });
      if (j.support_wa) $("f_wa").href = "https://wa.me/" + j.support_wa;
      renderLoc(); renderRace();
    }).catch(function () {});
  }

  // ---------- form ----------
  function showErr(id, key) { var el = $(id); if (!key) { el.hidden = true; el.textContent = ""; return; } el.textContent = t(key); el.hidden = false; }
  function clearErrs() { ["e_area", "e_phone", "e_consent", "e_form"].forEach(function (id) { showErr(id, null); }); }

  function cleanPhone(v) {
    var d = String(v || "").replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    else if (d.length === 11 && d[0] === "0") d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : "";
  }

  function submit(e) {
    e.preventDefault();
    if (state.sending) return;
    clearErrs();
    if (!state.loc && !$("pinOther").hidden && $("pinOther").value.trim().length >= 2) {  // typed a place under a PIN, did not press Enter
      var z = IDX.zoneByPin[$("pin").value];
      if (z) state.loc = { district: z.d, pin: z.pin, place: $("pinOther").value.trim(), typed: true };
    }
    var phone = cleanPhone($("phone").value), ok = true;
    if (!state.loc) { showErr("e_area", "e_area"); ok = false; }
    if (!phone) { showErr("e_phone", "e_phone"); ok = false; }
    if (!$("consent").checked) { showErr("e_consent", "e_consent"); ok = false; }
    if (!ok) { var first = document.querySelector(".err:not([hidden])"); if (first) first.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    state.sending = true; $("submit").disabled = true; $("submit").textContent = t("sending");
    api("join", {
      role: state.role, district: state.loc.district, pin: state.loc.pin, place: state.loc.place, phone: phone,
      name: $("name").value.trim(), consent: true, lang: state.lang, ref: attr.ref, src: attr.src, utm: attr.utm, hp: $("hp").value
    }).then(function (j) {
      if (j.ok && j.id) {
        lsSet("fkj-lead", { id: j.id, t: j.t });
        state.lead = j;
        showDone(); renderMore(); loadBoard();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (j.ok && j.already) {
        state.lead = { already: true, role: state.role };
        showDone();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (j.error === "rate") showErr("e_form", "e_rate");
      else if (j.error === "phone") showErr("e_phone", "e_phone");
      else if (j.error === "pin") { showErr("e_area", "pin_bad"); resetLoc(); }
      else if (j.error === "district") showErr("e_area", "e_area");
      else if (j.error === "place") showErr("e_area", "e_place");
      else if (j.error === "consent") showErr("e_consent", "e_consent");
      else showErr("e_form", "e_net");
    }).catch(function () { showErr("e_form", "e_net"); })
      .then(function () { state.sending = false; $("submit").disabled = false; $("submit").textContent = t("cta_" + state.role); });
  }

  // ---------- after joining ----------
  function myLink() {
    var L = state.lead, p = [];
    if (L && L.code) p.push("ref=" + L.code);
    if (L && L.role && L.role !== "customer") p.push("role=" + L.role);
    if (state.lang === "ml") p.push("lang=ml");
    return location.origin + "/join/" + (L && L.pin ? L.pin : "") + (p.length ? "?" + p.join("&") : "");
  }

  function showDone() {
    var L = state.lead;
    $("form").hidden = true;
    $("done").hidden = false;
    $("again_wrap").hidden = false;
    var area = L.zone_name || "", role = L.role || "customer", link = myLink();
    var meter = $("d_meter"), left = $("d_left");
    meter.hidden = true; left.textContent = "";
    if (L.already && !L.code) {
      $("d_title").textContent = t("already_t");
      $("d_sub").textContent = t("already_s");
      $("share").href = "https://wa.me/?text=" + encodeURIComponent(t("share_generic", { link: link }));
      $("share_text").textContent = t("share_btn_customer");
      $("mylink").textContent = link.replace(/^https?:\/\//, "");
      $("brought").textContent = "";
      $("group").hidden = true; $("group_hint").textContent = "";
      $("more").hidden = true;
      return;
    }
    if (role === "customer") {
      if (!L.pin) {
        $("d_title").textContent = t("d_other", { area: area });
        $("d_sub").textContent = t(L.count === 1 ? "d_other_cnt1" : "d_other_cnt", { count: L.count, area: area });
      } else {
        $("d_title").textContent = t("d_cust", { n: L.pos, area: area });
        $("d_sub").textContent = t(L.count === 1 ? "d_cust_sub1" : "d_cust_sub", { count: L.count, area: area }) +
          (L.rank ? " " + t("d_rank", { area: area, rank: L.rank }) : "");
      }
    } else {
      $("d_title").textContent = t(role === "shop" ? "d_shop" : "d_rider", { area: area });
      $("d_sub").textContent = t(role === "shop" ? "d_shop_sub" : "d_rider_sub");
    }
    if (L.target) {
      meter.hidden = false;
      meter.querySelector("i").style.width = Math.min(100, Math.round(L.count / L.target * 100)) + "%";
      meter.querySelector(".cnt").textContent = L.count + " / " + L.target + " " + t("unit_" + role);
      if (role === "customer") left.textContent = L.count >= L.target ? t("reached", { area: area }) : t("left", { r: L.target - L.count, area: area });
    }
    $("share").href = "https://wa.me/?text=" + encodeURIComponent(t("share_" + role, { area: area, link: link }));
    $("share_text").textContent = t("share_btn_" + role);
    $("mylink").textContent = link.replace(/^https?:\/\//, "");
    $("brought").textContent = L.referrals > 1 ? t("brought", { n: L.referrals }) : L.referrals === 1 ? t("brought1") : t("brought0", { area: area });
    var g = $("group");
    g.hidden = false;
    if (L.group) {
      g.href = L.group;
      g.textContent = t("group_" + role, { area: area });
      $("group_hint").textContent = role === "customer" ? t("group_hint", { area: area }) : "";
    } else {
      g.href = "https://wa.me/" + (L.support_wa || "918157863503") + "?text=" + encodeURIComponent(t("hi_msg", { area: area }));
      g.textContent = t("msg_us");
      $("group_hint").textContent = t("save_no");
    }
    $("more").hidden = false;
  }

  function copyLink() {
    var link = myLink(), btn = $("copy");
    function done() { btn.textContent = t("copied"); setTimeout(function () { btn.textContent = t("copy"); }, 1600); }
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = link; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback); else fallback();
  }

  // ---------- optional questions ----------
  function chips(name, values, prefix, picked, single) {
    picked = Array.isArray(picked) ? picked : (picked ? [picked] : []);
    return '<div class="chips" data-q="' + name + '"' + (single ? " data-single" : "") + ">" + values.map(function (v) {
      return '<button type="button" class="chip" data-v="' + v + '" aria-pressed="' + (picked.indexOf(v) >= 0) + '">' + esc(t(prefix + v)) + "</button>";
    }).join("") + "</div>";
  }
  function q(label, inner, id) { return '<div class="q"' + (id ? ' id="' + id + '"' : "") + "><p>" + esc(t(label)) + "</p>" + inner + "</div>"; }
  function kindSelect(val) {
    return '<select aria-label="Kind">' + ["fish", "meat", "veg", "grocery", "other"].map(function (k) {
      return '<option value="' + k + '"' + (val === k ? " selected" : "") + ">" + esc(t("k_" + k)) + "</option>";
    }).join("") + "</select>";
  }
  function shopRow(s) {
    return '<div class="shoprow"><input type="text" maxlength="60" placeholder="' + esc(t("shop_name_ph")) + '" value="' + esc(s ? s.name : "") + '">' + kindSelect(s ? s.kind : "fish") + "</div>";
  }

  function renderMore() {
    var L = state.lead;
    if (!L || !L.id) return;
    var x = L.extra || {}, h = "";
    if (L.role === "customer") {
      var shops = (x.shops && x.shops.length ? x.shops : [null]);
      h += q("q_buys", chips("buys", ["fish", "chicken", "mutton", "beef", "vegetables", "fruits", "groceries", "eggs"], "b_", x.buys));
      h += q("q_often", chips("often", ["daily", "few", "weekly", "sometimes"], "o_", x.often, true));
      h += q("q_shops", '<div id="shoprows">' + shops.map(shopRow).join("") + '</div><button type="button" class="linkbtn" id="addshop"' + (shops.length >= 3 ? " hidden" : "") + ">" + esc(t("add_shop")) + "</button>");
      h += q("q_flat", '<input type="text" id="flat" maxlength="80" placeholder="' + esc(t("flat_ph")) + '" value="' + esc(L.flat || "") + '">');
      h += q("q_week", chips("first_week", ["yes", "maybe", "no"], "w_", L.first_week, true), "q_week");
    } else if (L.role === "shop") {
      h += q("q_shopname", '<input type="text" id="shop_name" maxlength="80" value="' + esc(x.shop_name || "") + '">');
      h += q("q_sells", chips("sells", ["fish", "meat", "veg", "grocery", "other"], "k_", x.sells));
      h += q("q_delivers", chips("delivers", ["yes", "no"], "", x.delivers, true));
      h += q("q_visit", chips("visit", ["morning", "afternoon", "evening"], "t_", x.visit));
    } else {
      h += q("q_vehicle", chips("vehicle", ["scooter", "bike", "none"], "v_", x.vehicle, true));
      h += q("q_licence", chips("licence", ["yes", "no"], "", x.licence, true));
      h += q("q_times", chips("times", ["morning", "afternoon", "evening"], "rt_", x.times));
    }
    $("more_body").innerHTML = h;
    var add = $("addshop");
    if (add) add.onclick = function () {
      var rows = $("shoprows");
      rows.insertAdjacentHTML("beforeend", shopRow(null));
      if (rows.children.length >= 3) add.hidden = true;
      rows.lastElementChild.querySelector("input").focus();
    };
  }

  function picked(name) {
    var box = document.querySelector('.chips[data-q="' + name + '"]');
    if (!box) return null;
    var v = qsa('.chip[aria-pressed="true"]', box).map(function (b) { return b.dataset.v; });
    return box.hasAttribute("data-single") ? (v[0] || null) : v;
  }

  function saveMore() {
    var L = state.lead, body = { id: L.id, t: L.t }, msg = $("more_msg");
    if (L.role === "customer") {
      body.buys = picked("buys"); body.often = picked("often"); body.first_week = picked("first_week");
      body.flat = ($("flat") || {}).value || "";
      body.shops = qsa("#shoprows .shoprow").map(function (r) { return { name: r.querySelector("input").value.trim(), kind: r.querySelector("select").value }; })
        .filter(function (s) { return s.name.length >= 2; });
    } else if (L.role === "shop") {
      body.shop_name = ($("shop_name") || {}).value || ""; body.sells = picked("sells"); body.delivers = picked("delivers"); body.visit = picked("visit");
    } else {
      body.vehicle = picked("vehicle"); body.licence = picked("licence"); body.times = picked("times");
    }
    var btn = $("more_save");
    btn.disabled = true; btn.textContent = t("sending");
    api("more", body).then(function (j) {
      msg.hidden = false;
      if (j.ok) {
        msg.textContent = t("saved"); msg.style.color = "";
        L.extra = Object.assign({}, L.extra, body); delete L.extra.id; delete L.extra.t;
        if (body.first_week) L.first_week = body.first_week;
        if (body.flat != null) L.flat = body.flat;
      } else { msg.textContent = t("e_save"); msg.style.color = "var(--err)"; }
    }).catch(function () { msg.hidden = false; msg.textContent = t("e_net"); msg.style.color = "var(--err)"; })
      .then(function () { btn.disabled = false; btn.textContent = t("save"); });
  }

  // ---------- events ----------
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (chip && chip.closest("#more")) {
      var box = chip.parentNode, on = chip.getAttribute("aria-pressed") !== "true";
      if (box.hasAttribute("data-single")) qsa(".chip", box).forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      chip.setAttribute("aria-pressed", String(on));
      return;
    }
    var lb = e.target.closest("[data-lang]");
    if (lb) { state.lang = lb.dataset.lang; lsSet("fkj-lang", state.lang); applyText(); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.name === "role") { state.role = e.target.value; syncOn(); applyText(); }
  });
  $("pin").addEventListener("input", function () {
    var v = this.value.replace(/\D/g, "").slice(0, 6);
    if (v !== this.value) this.value = v;
    if (v.length === 6) onPin(v); else $("pinBox").hidden = true;
  });
  $("pinOther").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    var v = this.value.trim(), z = IDX && IDX.zoneByPin[$("pin").value];
    if (v.length >= 2 && z) choose({ district: z.d, pin: z.pin, place: v, typed: true });
  });
  $("noPin").addEventListener("click", function () { showDistrictPicker(true); });
  $("district").addEventListener("change", function () {
    state.preDistrict = this.value;
    $("placeWrap").hidden = !this.value; $("placeQ").value = ""; $("placeList").hidden = true;
    if (this.value) { state.pillName = dName(this.value); $("pill").textContent = t("coming_to", { name: state.pillName }); $("placeQ").focus(); }
  });
  $("placeQ").addEventListener("input", renderPlaceList);
  $("locChange").addEventListener("click", resetLoc);
  $("form").addEventListener("submit", submit);
  $("copy").addEventListener("click", copyLink);
  $("more_save").addEventListener("click", saveMore);
  $("again").addEventListener("click", function () {
    lsSet("fkj-lead", null); state.lead = null;
    $("form").hidden = false; $("done").hidden = true; $("more").hidden = true; $("again_wrap").hidden = true;
    $("phone").value = ""; $("name").value = ""; $("consent").checked = false;
    loadBoard();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------- start ----------
  qsa('input[name="role"]').forEach(function (i) { i.checked = i.value === state.role; });
  syncOn();
  applyText();

  var visitKey = "fkj-v-" + (attr.src || attr.ref || "direct");
  if (!ssGet(visitKey)) {
    ssSet(visitKey, "1");
    api("visit", { src: attr.src || (attr.ref ? "referral" : (attr.utm.utm_campaign || attr.utm.utm_source || "direct")) }).catch(function () {});
  }

  var boardReady = loadBoard();
  var placesLoaded = ensurePlaces().then(function () {
    // town links: /join/682024, /join/thrissur (a district), /join/edappally (a PIN area); ?pin= and ?district= work too
    var slug = slugMatch ? slugMatch[1] : "", pin = qs.get("pin") || "", district = (qs.get("district") || "").toLowerCase();
    if (/^\d{6}$/.test(slug)) pin = slug;
    else if (slug && IDX.dById[slug]) district = slug;
    else if (slug && IDX.zoneBySlug[slug]) pin = IDX.zoneBySlug[slug].pin;
    var z = pin && IDX.zoneByPin[pin];
    if (z) { state.loc = { district: z.d, pin: z.pin, place: qs.get("place") || z.name }; state.pillName = z.name; }
    else if (IDX.dById[district]) { state.preDistrict = district; state.pillName = dName(district); showDistrictPicker(false); }
    applyText();
  }).catch(function () {});

  if (attr.ref) {
    api("ref?c=" + encodeURIComponent(attr.ref)).then(function (j) {
      if (!j.ok) return;
      placesLoaded.then(function () {
        if (!qs.get("role") && j.role !== "customer") { state.role = j.role; qsa('input[name="role"]').forEach(function (i) { i.checked = i.value === state.role; }); syncOn(); }
        if (!state.loc && j.pin && IDX.zoneByPin[j.pin]) { state.loc = { district: j.district, pin: j.pin, place: j.place }; state.pillName = zoneName(j.pin); }
        else if (!state.loc && j.district) { state.preDistrict = j.district; showDistrictPicker(false); }
        applyText();
      });
    }).catch(function () {});
  }

  var saved = lsGet("fkj-lead");
  // a personal link from FrescoKart (/join/?id=..&t=..&prebook=1) opens this person's own page on any phone
  if (qs.get("id") && qs.get("t")) {
    saved = { id: parseInt(qs.get("id"), 10), t: qs.get("t") };
    lsSet("fkj-lead", saved);
    qs.delete("id"); qs.delete("t");
    try { history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs.toString() : "")); } catch (e) {}  // so it is not shared by accident
  }
  if (saved && saved.id && saved.t && !qs.get("new")) {
    api("me?id=" + saved.id + "&t=" + encodeURIComponent(saved.t)).then(function (j) {
      if (!j.ok) { if (j._status === 404) lsSet("fkj-lead", null); return; }
      state.lead = j;
      Promise.all([boardReady, placesLoaded]).then(function () {
        showDone(); renderMore();
        if (qs.get("prebook") && $("q_week")) { $("q_week").scrollIntoView({ behavior: "smooth", block: "center" }); $("q_week").classList.add("pulse"); }
      });
    }).catch(function () {});
  }
})();
