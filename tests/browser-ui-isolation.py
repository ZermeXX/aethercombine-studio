from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    audit = """() => {
      window.__storageAudit = [];
      window.__auditEnabled = true;
      for (const method of ['getItem','setItem','removeItem','clear','key']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function(...args) {
          if(window.__auditEnabled) window.__storageAudit.push({method,key:String(args[0]??''),area:this===sessionStorage?'session':'local'});
          return original.apply(this,args);
        };
      }
    }"""
    page.add_init_script("("+audit+")()")
    page.goto("http://127.0.0.1:8765/aethercombine-studio/?v9-project-preview=1")
    expect(page.get_by_role("button",name="Open isolated project editor")).to_be_visible()
    assert page.evaluate("window.__storageAudit.length") == 0
    page.evaluate("""() => {window.__auditEnabled=false;try{localStorage.setItem('aether_workspace_draft','legacy-fixture');localStorage.setItem('ac_youtube_seo_state_v1','seo-fixture');localStorage.setItem('ac_gh_token','synthetic-migration-fixture');}finally{window.__auditEnabled=true;}}""")
    page.get_by_role("button",name="Open isolated project editor").click()
    ws=page.get_by_label("Isolated workspace")
    name=page.get_by_label("New project name")
    script=page.get_by_label("VerbaFlow script")
    expect(name).to_be_enabled()
    expect(page.get_by_role("navigation",name="Production modules")).to_have_count(0)
    # Dedicated shell acceptance in an independent browser context.
    shell = browser.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    shell.goto("http://127.0.0.1:8765/aethercombine-studio/?v9-project-preview=1")
    shell.get_by_role("button",name="Open isolated project editor").click()
    expect(shell.get_by_label("New project name")).to_be_enabled()
    expect(shell.get_by_label("Project format").locator("option[value=ambient]")).to_have_count(0)
    shell.get_by_role("button",name="Help language").click()
    expect(shell.get_by_role("button",name="Help language")).to_have_text("RU")
    help_button=shell.get_by_role("button",name="Справка",exact=True).first
    help_button.tap()
    expect(help_button).to_have_attribute("aria-expanded","true")
    shell.get_by_role("button",name="Подробнее",exact=True).click()
    expect(shell.get_by_text("Ограничения",exact=True)).to_be_visible()
    help_button.press("Escape")
    expect(help_button).to_have_attribute("aria-expanded","false")
    shell.reload()
    shell.get_by_role("button",name="Open isolated project editor").click()
    expect(shell.get_by_role("button",name="Help language")).to_have_text("RU")
    shell.get_by_role("button",name="Help language").click()
    shell.get_by_label("Isolated workspace").select_option("the_whisker_trio")
    expect(shell.get_by_label("New project name")).to_be_enabled()
    shell.get_by_label("Project format").select_option("shorts")
    shell.get_by_label("New project name").fill("Shell Shorts")
    shell.get_by_role("button",name="Create isolated project").click()
    nav=shell.get_by_role("navigation",name="Production modules")
    expect(nav).to_be_visible()
    expect(shell.get_by_role("button",name="Open scoped Loop settings")).to_have_count(0)
    shell.locator(".nexus-nav-toggle").click()
    expect(nav).not_to_be_visible()
    shell.locator(".nexus-nav-toggle").click()
    expect(nav).to_be_visible()
    expect(shell.locator(".nexus-smart-header")).to_contain_text("Shell Shorts")
    expect(shell.locator(".nexus-smart-header")).to_contain_text("The Whisker Trio")
    expect(shell.locator(".nexus-header-actions").get_by_role("button",name="Project library")).to_be_visible()
    shell.set_viewport_size({"width":1280,"height":900})
    compact=shell.locator(".nexus-compact-toggle")
    expect(compact).to_be_visible()
    compact.click()
    expect(compact).to_have_attribute("aria-pressed","true")
    expect(shell.get_by_role("button",name="Open native Montage Combine")).to_be_visible()
    shell.reload()
    shell.get_by_role("button",name="Open isolated project editor").click()
    shell.get_by_label("Isolated workspace").select_option("the_whisker_trio")
    expect(shell.get_by_label("New project name")).to_be_enabled()
    shell.locator(".nexus-project-cards").get_by_role("button",name="Shell Shorts",exact=False).click()
    expect(compact).to_have_attribute("aria-pressed","true")
    compact.click()
    expect(compact).to_have_attribute("aria-pressed","false")
    shell.close()
    responsive=browser.new_page(viewport={"width":1280,"height":800})
    responsive.goto("http://127.0.0.1:8765/aethercombine-studio/?v9-project-preview=1")
    responsive.get_by_role("button",name="Open isolated project editor").click()
    long_name="HISTOVIVA — Documentary " + "LongProjectTitle"*5
    expect(responsive.get_by_label("New project name")).to_be_enabled()
    responsive.get_by_label("New project name").fill(long_name)
    responsive.get_by_role("button",name="Create isolated project").click()
    rh=responsive.locator(".nexus-smart-header")
    expect(rh.locator(".nexus-header-item strong").last).to_have_attribute("title",long_name)
    for width,height in [(320,640),(390,844),(768,1024),(1280,800),(1920,1080)]:
        responsive.set_viewport_size({"width":width,"height":height})
        for lang in ["EN","RU"]:
            toggle=rh.get_by_role("button",name="Help language")
            if toggle.inner_text()!=lang:
                toggle.click()
            expect(toggle).to_have_text(lang)
            expect(rh.locator(".nexus-header-actions button").last).to_be_visible()
            responsive.evaluate("() => document.fonts.ready")
            print("HEADER_GEOMETRY", width, lang, rh.evaluate("""el => [el,...el.querySelectorAll("button"),...el.children].map(n=>({tag:n.tagName,cls:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,client:n.clientWidth,scroll:n.scrollWidth}))"""), flush=True)
            assert rh.evaluate("""el => {
                const r=el.getBoundingClientRect();
                return r.left>=-1 && r.right<=innerWidth+1 && el.scrollWidth<=el.clientWidth+1 &&
                  [...el.querySelectorAll('button')].every(b=>{const q=b.getBoundingClientRect();return q.left>=r.left-1 && q.right<=r.right+1 && q.width>0 && q.height>0;});
            }"""), f"Header overflow at {width}x{height} {lang}"
            print(f"NEXUS_HEADER_LAYOUT_PASS {width}x{height} {lang}")
    responsive.close()
    print("NEXUS_SHELL_LANGUAGE_HELP_NAV_PASS")
    name.fill("History UI")
    page.get_by_role("button",name="Create isolated project").click()
    expect(script).to_be_enabled()
    expect(page.get_by_role("button",name="Open scoped Loop settings")).to_have_count(0)
    expect(page.get_by_role("button",name="Open native Montage Combine")).to_be_visible()
    header=page.locator(".nexus-smart-header")
    expect(header).to_contain_text("HISTOVIVA")
    expect(header).to_contain_text("History UI")
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","saved")
    quick=header.get_by_role("button",name="Quick save")
    expect(quick).to_be_disabled()
    script.fill("History narration")
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","dirty")
    expect(quick).to_be_enabled()
    quick.click()
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","saved")
    expect(script).to_have_value("History narration")
    header.get_by_role("button",name="Project library").click()
    expect(page.locator("#nexus-project-library")).to_be_focused()
    header.get_by_role("button",name="Help language").click()
    expect(header).to_contain_text("Сохранено локально")
    header.get_by_role("button",name="Help language").click()
    expect(script).to_have_value("History narration")
    card=page.locator(".nexus-project-card").filter(has_text="History UI")
    menu=card.locator(".nexus-card-menu")
    menu.locator("summary").click()
    expect(menu.get_by_role("button",name="Save changes")).to_be_disabled()
    script.fill("History narration updated")
    expect(menu.get_by_role("button",name="Save changes")).to_be_enabled()
    menu.get_by_role("button",name="Save changes").click()
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","saved")
    script.fill("History narration")
    quick.click()
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","saved")
    page.once("dialog",lambda d:d.accept("History UI renamed"))
    menu.get_by_role("button",name="Rename").click()
    expect(header).to_contain_text("History UI renamed")
    expect(script).to_have_value("History narration")
    page.once("dialog",lambda d:d.dismiss())
    menu.get_by_role("button",name="Rename").click()
    expect(header).to_contain_text("History UI renamed")
    page.once("dialog",lambda d:d.accept("History UI"))
    menu.get_by_role("button",name="Rename").click()
    expect(header.locator(".nexus-header-item strong").last).to_have_text("History UI")
    menu.locator("summary").click()
    print("NEXUS_PROJECT_RENAME_PASS")
    menu.locator("summary").click()
    page.once("dialog",lambda d:d.accept("Independent duplicate"))
    menu.get_by_role("button",name="Duplicate").click()
    duplicate=page.locator(".nexus-project-card").filter(has_text="Independent duplicate")
    expect(duplicate).to_be_visible()
    expect(header.locator(".nexus-header-item strong").last).to_have_text("History UI")
    duplicate.locator(":scope > button").click()
    expect(script).to_have_value("History narration")
    script.fill("Independent narration")
    quick.click()
    expect(header.locator(".nexus-header-status")).to_have_attribute("data-state","saved")
    card.locator(":scope > button").click()
    expect(script).to_have_value("History narration")
    duplicate.locator(":scope > button").click()
    expect(script).to_have_value("Independent narration")
    card.locator(":scope > button").click()
    expect(script).to_have_value("History narration")
    print("NEXUS_PROJECT_DUPLICATION_PASS")
    import json
    if menu.locator("summary").get_attribute("aria-expanded") != "true" and not menu.evaluate("el => el.open"):
        menu.locator("summary").click()
    with page.expect_download() as exported:
        menu.get_by_role("button",name="Export project").click()
    with open(exported.value.path(),encoding="utf-8") as f:
        backup=json.load(f)
    assert backup["format"]=="story-nexus-project" and backup["version"]==1
    assert backup["content"]["project"]["name"]=="History UI"
    assert backup["content"]["payload"]["script"]=="History narration"
    assert len(backup["sha256"])==64
    print("NEXUS_PROJECT_EXPORT_PASS")
    picker=page.get_by_label("Import project backup")
    picker.set_input_files(str(exported.value.path()))
    restored=page.locator(".nexus-project-card").filter(has_text="History UI — imported")
    expect(restored).to_have_count(1)
    restored.locator(":scope > button").click()
    expect(script).to_have_value("History narration")
    project_count_before_tamper=page.locator(".nexus-project-card").count()
    backup["content"]["payload"]["script"]="tampered"
    picker.set_input_files({"name":"tampered.json","mimeType":"application/json","buffer":json.dumps(backup).encode()})
    expect(page.get_by_role("alert")).to_contain_text("Operation failed. Current edits retained.")
    expect(page.locator(".nexus-project-card")).to_have_count(project_count_before_tamper)
    expect(restored).to_have_count(1)
    card=page.locator(".nexus-project-card").filter(has=page.locator(".nexus-card-name",has_text="History UI")).filter(has_not_text="imported")
    card.locator(":scope > button").click()
    expect(script).to_have_value("History narration")
    print("NEXUS_PROJECT_IMPORT_PASS")
    archived_menu=restored.locator(".nexus-card-menu")
    archived_menu.locator("summary").click()
    page.once("dialog",lambda d:d.dismiss())
    archived_menu.get_by_role("button",name="Archive project").click()
    expect(restored).to_have_count(1)
    page.once("dialog",lambda d:d.accept())
    archived_menu.get_by_role("button",name="Archive project").click()
    expect(restored).to_have_count(0)
    archive=page.locator("details").filter(has=page.locator("summary",has_text="Archived projects"))
    archive.locator("summary").click()
    expect(archive).to_contain_text("History UI — imported")
    with page.expect_download() as archived_export:
        archive.get_by_role("button",name="Export project").click()
    with open(archived_export.value.path(),encoding="utf-8") as f:
        archived_backup=json.load(f)
    assert archived_backup["content"]["project"]["archived"] is True
    assert archived_backup["content"]["payload"]["script"]=="History narration"
    expect(script).to_have_value("History narration")
    print("NEXUS_PROJECT_ARCHIVE_PASS")
    archive.get_by_role("button",name="Restore project").click()
    expect(restored).to_have_count(1)
    expect(archive.get_by_role("button",name="Restore project")).to_have_count(0)
    expect(script).to_have_value("History narration")
    restored.locator(".nexus-card-menu summary").click()
    with page.expect_download() as restored_export:
        restored.get_by_role("button",name="Export project").click()
    with open(restored_export.value.path(),encoding="utf-8") as f:
        restored_backup=json.load(f)
    assert restored_backup["content"]["project"]["projectId"]==archived_backup["content"]["project"]["projectId"]
    assert restored_backup["content"]["project"]["revision"]==archived_backup["content"]["project"]["revision"]+1
    assert restored_backup["content"]["project"]["archived"] is False
    assert restored_backup["content"]["payload"]==archived_backup["content"]["payload"]
    print("NEXUS_PROJECT_RESTORE_PASS")
    print("NEXUS_PROJECT_CARD_MENU_PASS")
    print("NEXUS_SMART_HEADER_PASS")
    page.get_by_text("Advanced production settings (JSON)",exact=True).click()
    production=page.get_by_label("Production settings JSON")
    production.fill('{"fps":24,"codec":"libx264","resolution":"4k","loopHours":6,"scenes":[]}')
    ws.select_option("the_whisker_trio")
    expect(script).to_be_disabled()
    expect(name).to_be_enabled()
    name.fill("Ambient UI")
    page.get_by_label("Project format").select_option("ambient")
    page.get_by_role("button",name="Create isolated project").click()
    expect(script).to_be_enabled()
    expect(script).to_have_value("")
    expect(page.get_by_role("button",name="Open scoped Loop settings")).to_be_visible()
    expect(page.get_by_role("button",name="Open native Montage Combine")).to_be_visible()
    script.fill("Ambient narration")
    ws.select_option("histoviva")
    expect(script).to_have_value("History narration")
    assert '"loopHours": 6' in production.input_value()
    production.fill('{"invalid":true}')
    ws.select_option("the_whisker_trio")
    expect(page.get_by_role("alert")).to_be_visible()
    expect(ws).to_have_value("histoviva")
    expect(script).to_have_value("History narration")
    expect(production).to_have_value('{"invalid":true}')
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_workspace_draft')}finally{window.__auditEnabled=true}}")=="legacy-fixture"
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('ac_youtube_seo_state_v1')}finally{window.__auditEnabled=true}}")=="seo-fixture"
    production.fill('{"fps":24,"codec":"libx264","resolution":"4k","loopHours":6,"scenes":[]}')
    page.get_by_role("button",name="Open native VerbaFlow").click()
    native=page.get_by_role("group",name="Native VerbaFlow")
    expect(native).to_be_visible()
    source=native.locator('textarea').first
    expect(source).to_have_value("History narration")
    source.fill("Native history narration")
    page.get_by_role("button",name="Open native YouTube SEO").click()
    expect(page.get_by_role("group",name="Native YouTube SEO")).to_be_visible()
    ws.select_option("the_whisker_trio")
    expect(script).to_have_value("Ambient narration")
    ws.select_option("histoviva")
    expect(script).to_have_value("Native history narration")
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_workspace_draft')}finally{window.__auditEnabled=true}}")=="legacy-fixture"
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('ac_youtube_seo_state_v1')}finally{window.__auditEnabled=true}}")=="seo-fixture"
    ws.select_option("the_whisker_trio")
    production.fill('{"fps":24,"codec":"libx264","resolution":"4k","loopHours":6,"scenes":[]}')
    page.get_by_role("button",name="Open scoped Loop settings").click()
    expect(page.get_by_label("Loop loopHours")).to_have_value("6")
    page.get_by_role("button",name="Loop preset 10 hours").click()
    page.get_by_label("Render crf").fill("20")
    page.get_by_label("Render bitrate preset").select_option("cinema")
    ws.select_option("histoviva")
    expect(page.get_by_role("button",name="Open scoped Loop settings")).to_have_count(0)
    ws.select_option("the_whisker_trio")
    expect(script).to_have_value("Ambient narration")
    page.get_by_role("button",name="Open scoped Loop settings").click()
    expect(page.get_by_label("Loop loopHours")).to_have_value("10")
    expect(page.get_by_label("Loop project name")).to_have_value("Ambient UI")
    expect(page.get_by_label("Render crf")).to_have_value("20")
    expect(page.get_by_label("Render bitrate preset")).to_have_value("cinema")
    page.get_by_role("button",name="Add timeline slot").click()
    page.get_by_label("Slot title 1").fill("Ambient slot")
    page.get_by_label("Slot filename 1").fill("scene.mp4")
    page.get_by_role("button",name="Loop preset 5 hours").click()
    expect(page.get_by_label("Slot duration 1")).to_have_value("18000")
    page.get_by_label("Slot source duration 1").fill("12")
    page.get_by_label("Slot loop seam 1").fill("2")
    page.get_by_role("button",name="Add insert to slot 1").click()
    page.get_by_label("Insert filename 1.1").fill("cutaway.mp4")
    page.get_by_label("Insert trigger_at_sec 1.1").fill("120")
    page.get_by_label("Insert duration_sec 1.1").fill("12")
    page.get_by_label("Insert transition_in seconds 1.1").fill("1.5")
    page.get_by_label("Insert duration_sec 1.1").fill("20000")
    expect(page.get_by_text("Invalid insert timing or slot duration. Previous values retained.")).to_be_visible()
    expect(page.get_by_label("Insert duration_sec 1.1")).to_have_value("12")
    page.get_by_label("integrated_lufs").fill("-14.5")
    page.get_by_role("button",name="Save project").click()
    page.get_by_role("button",name="Open scoped Loop settings").click()
    expect(page.get_by_label("Slot title 1")).to_have_value("Ambient slot")
    expect(page.get_by_label("Slot source duration 1")).to_have_value("12")
    expect(page.get_by_label("Slot loop seam 1")).to_have_value("2")
    expect(page.get_by_label("Insert filename 1.1")).to_have_value("cutaway.mp4")
    expect(page.get_by_label("Insert trigger_at_sec 1.1")).to_have_value("120")
    expect(page.get_by_label("Insert duration_sec 1.1")).to_have_value("12")
    expect(page.get_by_label("Insert transition_in seconds 1.1")).to_have_value("1.5")
    print("SCOPED_INSERT_ROUNDTRIP_PASS")
    # Temporary compatible export fixture; restore the original production data afterwards.
    import json
    original=production.input_value()
    export_fixture=json.loads(original)
    export_fixture.pop("audio_mastering",None)
    export_fixture["render"].update({"finalBlackEnabled":False,"transitionMode":"crossfade","useEmbeddedAudio":True,"bitratePreset":"standard"})
    page.get_by_role("button",name="Close native module").click()
    production.fill(json.dumps(export_fixture))
    page.get_by_role("button",name="Open scoped Loop settings").click()
    page.get_by_label("Export Drive folder ID").fill("synthetic-folder")
    with page.expect_download() as download_info:
        page.get_by_role("button",name="Download loop manifest JSON").click()
    downloaded=download_info.value
    assert downloaded.suggested_filename=="loop_manifest.json"
    with open(downloaded.path(),encoding="utf-8") as handle:
        exported=json.load(handle)
    assert exported["cloud_export"]["target_folder_id"]=="synthetic-folder"
    assert exported["timeline_slots"][0]["slot_duration_sec"]==18000
    assert exported["timeline_slots"][0]["inserts"][0]["transition_duration_sec"]==1.5
    assert exported["timeline_slots"][0]["inserts"][0]["trigger_at_sec"]==120
    print("NATIVE_MANIFEST_DOWNLOAD_PASS")
    page.get_by_label("Preflight Drive folder ID").fill("synthetic-folder")
    page.get_by_role("button",name="Check production preflight").click()
    report=page.get_by_label("Production preflight report")
    expect(report).to_contain_text('"dispatchAllowed": false')
    preflight=json.loads(report.inner_text())
    assert preflight["assets"]
    assert all(not asset["runnerVerified"] for asset in preflight["assets"])
    assert preflight["blockers"]
    page.get_by_label("Preflight Drive folder ID").fill("different-folder")
    expect(report).to_have_count(0)
    print("PRODUCTION_PREFLIGHT_BROWSER_PASS")
    # Intercept all GitHub API calls; never dispatch a real cloud job in browser CI.
    requests=[]
    evidence_valid=[True]
    side_effect_executed=[False]
    def github_fixture(route):
        req=route.request
        headers={"access-control-allow-origin":"*","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"authorization, accept, content-type, x-github-api-version"}
        if req.method=="OPTIONS":
            route.fulfill(status=204,headers=headers)
            return
        assert req.headers.get("authorization")=="Bearer synthetic-preflight-token"
        if "/git/ref/heads/" in req.url:
            route.fulfill(status=200,headers=headers,json={"object":{"sha":preflight["rendererCandidate"]}})
        elif req.url.endswith("/dispatches"):
            body=req.post_data_json
            assert body["inputs"]["preflight_only"]=="true"
            assert body["inputs"]["strict_project_contract"]=="true"
            assert body["inputs"]["expected_renderer_sha"]==preflight["rendererCandidate"]
            assert "synthetic-preflight-token" not in body["inputs"]["manifest_payload"]
            requests.append(body)
            route.fulfill(status=204,headers=headers)
        elif "/runs/42/jobs?" in req.url:
            names=["Strict Project Dispatch Identity Guard","Preflight Asset Check","Download Source Clips (only needed files)","Strict Project Media Verification","Build and Run FFmpeg Pipeline","Upload Output Video, Shorts & Metadata to Google Drive","Generate Vertical Shorts & Release Card","Upload QC artifacts","Send Telegram Notification"]
            steps=[{"name":name,"status":"completed","conclusion":"success" if i<4 else "skipped"} for i,name in enumerate(names)]
            if not evidence_valid[0]:
                steps=[s for s in steps if s["name"]!="Strict Project Media Verification"]
            if side_effect_executed[0]:
                next(s for s in steps if s["name"]=="Send Telegram Notification")["conclusion"]="success"
            route.fulfill(status=200,headers=headers,json={"jobs":[{"run_id":42,"head_sha":preflight["rendererCandidate"],"name":"render_and_upload","status":"completed","conclusion":"success","steps":steps}]})
        elif "/runs?" in req.url:
            route.fulfill(status=200,headers=headers,json={"workflow_runs":[{"id":42,"display_title":"Strict preflight "+requests[0]["inputs"]["request_id"],"head_sha":preflight["rendererCandidate"],"head_branch":"fix/loop-timestamp-boundaries-v81","event":"workflow_dispatch","status":"completed","conclusion":"success"}]})
        else:
            route.abort()
    page.route("https://api.github.com/**",github_fixture)
    token=page.get_by_label("Preflight GitHub token")
    dispatch=page.get_by_role("button",name="Dispatch strict preflight only")
    lookup=page.get_by_role("button",name="Check matching preflight run")
    expect(dispatch).to_be_disabled()
    token.fill("synthetic-preflight-token")
    dispatch.click()
    expect(page.get_by_text("Preflight request accepted; runner not verified",exact=True)).to_be_visible()
    expect(token).to_have_value("")
    assert len(requests)==1
    expect(lookup).to_be_disabled()
    token.fill("synthetic-preflight-token")
    lookup.click()
    expect(page.get_by_text("Run 42: completed / success; strict runner evidence verified; production dispatch blocked",exact=True)).to_be_visible()
    expect(token).to_have_value("")
    evidence_valid[0]=False
    token.fill("synthetic-preflight-token")
    lookup.click()
    expect(page.get_by_text("Run 42: completed / success; strict runner evidence not verified",exact=True)).to_be_visible()
    evidence_valid[0]=True
    side_effect_executed[0]=True
    token.fill("synthetic-preflight-token")
    lookup.click()
    expect(page.get_by_text("Run 42: completed / success; strict runner evidence not verified",exact=True)).to_be_visible()
    expect(token).to_have_value("")
    print("STRICT_EVIDENCE_UI_BROWSER_PASS")
    print("EXTENDED_EVIDENCE_SIDE_EFFECT_BROWSER_PASS")
    expect(token).to_have_value("")
    token.fill("synthetic-preflight-token")
    page.get_by_label("Preflight Drive folder ID").fill("another-folder")
    expect(token).to_have_value("")
    expect(lookup).to_be_disabled()
    page.unroute("https://api.github.com/**",github_fixture)
    print("NATIVE_AUTH_PREFLIGHT_BROWSER_PASS")
    page.get_by_role("button",name="Close native module").click()
    production.fill(original)
    page.get_by_role("button",name="Open scoped Loop settings").click()

    page.get_by_label("Attach referenced file").set_input_files({"name":"scene.mp4","mimeType":"video/mp4","buffer":b"fixture media"})
    expect(page.get_by_text("Asset attached and verified",exact=True)).to_be_visible()
    ws.select_option("histoviva")
    expect(page.get_by_role("button",name="Open scoped Loop settings")).to_have_count(0)
    expect(page.get_by_label("Slot title 1")).to_have_count(0)
    ws.select_option("the_whisker_trio")
    page.get_by_role("button",name="Open scoped Loop settings").click()
    expect(page.get_by_label("integrated_lufs")).to_have_value("-14.5")
    expect(page.get_by_text("scene.mp4: Attached (local)",exact=True)).to_be_visible()
    ws.select_option("histoviva")
    expect(page.get_by_role("button",name="Open scoped Loop settings")).to_have_count(0)
    print("WORKSPACE_ADAPTIVE_NAVIGATION_PASS")
    # Seed a nonempty scene through the validated project editor, then edit via native UI.
    import json
    fixture=json.loads(production.input_value())
    fixture["narrative_scenes"]=[{"scene_id":"native-scene-1","scene_index":1,"file_name":"scene.mp4","text_overlay":"History","duration":8,"start_time":0,"transition":{"type":"fade","duration_sec":0.5},"brand_identity_visible":True,"cta_config":{"enabled":True,"style":"subscribe_bell","show_sec":[1,7],"click_sec":2,"bell_sec":4,"sfx_enabled":True,"sfx_volume":1}}]
    production.fill(json.dumps(fixture))
    page.get_by_role("button",name="Open native Montage Combine").click()
    montage=page.get_by_role("group",name="Native Montage Combine")
    expect(montage).to_be_visible()
    montage.get_by_text("Настройки сцены V8.1 · Video / Audio / Branding / CTA",exact=True).click()
    expect(montage.get_by_label("CTA SFX volume")).to_have_value("1")
    montage.get_by_label("CTA SFX volume").fill("0.75")
    montage.get_by_label("Видимость бренда").select_option("hide")
    page.get_by_role("button",name="Save project").click()
    expect(montage).to_have_count(0)
    ws.select_option("the_whisker_trio")
    ws.select_option("histoviva")
    page.get_by_role("button",name="Open native Montage Combine").click()
    expect(montage).to_be_visible()
    montage.get_by_text("Настройки сцены V8.1 · Video / Audio / Branding / CTA",exact=True).click()
    expect(montage.get_by_label("CTA SFX volume")).to_have_value("0.75")
    expect(montage.get_by_label("Видимость бренда")).to_have_value("hide")
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_workspace_draft')}finally{window.__auditEnabled=true}}")=="legacy-fixture"
    import base64
    page.get_by_role("button",name="Close native module").click()
    # Generate a valid PNG using Chromium's own encoder rather than a hardcoded fixture.
    png=base64.b64decode(page.evaluate("""() => {const c=document.createElement('canvas');c.width=16;c.height=16;const ctx=c.getContext('2d');ctx.fillStyle='#d4a64e';ctx.fillRect(0,0,16,16);return c.toDataURL('image/png').split(',')[1];}"""))
    expect(page.get_by_label("Project image A",exact=True)).to_be_enabled()
    page.get_by_label("Project image A",exact=True).set_input_files({"name":"cover.png","mimeType":"image/png","buffer":png})
    expect(page.get_by_text("Project image saved: A",exact=True)).to_be_visible()
    expect(page.get_by_alt_text("Stored project image A")).to_be_visible()
    # Hold the actual decoder, attempt a competing upload in the same JS turn,
    # then reject the first operation and verify the lock is released.
    page.evaluate("""() => {
      window.__realDecode = window.createImageBitmap;
      window.createImageBitmap = (...args) => new Promise((resolve,reject) => {
        window.__rejectDecode = reject;
      });
      const upload = label => {
        const input=document.querySelector('input[aria-label="'+label+'"]');
        const dt=new DataTransfer();dt.items.add(new File(['bad'],'bad.png',{type:'image/png'}));
        input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      };
      upload('Project image B');upload('Project image C');
    }""")
    expect(ws).to_be_disabled()
    expect(page.get_by_label("Project image C",exact=True)).to_be_disabled()
    page.evaluate("""() => {window.createImageBitmap=window.__realDecode;window.__rejectDecode(new Error('synthetic decode failure'));}""")
    expect(page.get_by_text("Project image rejected",exact=True)).to_be_visible()
    expect(ws).to_be_enabled()
    expect(page.get_by_alt_text("Stored project image B")).to_have_count(0)
    expect(page.get_by_alt_text("Stored project image C")).to_have_count(0)
    expect(page.get_by_alt_text("Stored project image A")).to_be_visible()
    page.get_by_label("Project image B",exact=True).set_input_files({"name":"recovery.png","mimeType":"image/png","buffer":png})
    expect(page.get_by_text("Project image saved: B",exact=True)).to_be_visible()
    print("ASSET_WRITE_FAILURE_RECOVERY_PASS")
    ws.select_option("the_whisker_trio")
    expect(page.get_by_alt_text("Stored project image A")).to_have_count(0)
    ws.select_option("histoviva")
    expect(page.get_by_alt_text("Stored project image A")).to_be_visible()
    page.get_by_role("button",name="Open native Thumbnail Studio").click()
    expect(page.get_by_role("group",name="Native Thumbnail Studio")).to_be_visible()
    page.get_by_label("Native thumbnail background").set_input_files({"name":"native.png","mimeType":"image/png","buffer":png})
    expect(page.get_by_text("Native image saved: A",exact=True)).to_be_visible()
    page.get_by_role("button",name="📋 Скопировать настройки в...").click()
    page.get_by_role("button",name="Скопировать в Вариант C").click()
    expect(page.get_by_text("Native image saved: C",exact=True)).to_be_visible()
    expect(page.get_by_alt_text("Stored project image C")).to_be_visible()
    print("NATIVE_THUMBNAIL_COPY_PASS")
    page.get_by_role("tab",name="Вариант C",exact=False).click()
    page.get_by_role("button",name="Remove native thumbnail C").click()
    expect(page.get_by_text("Native image removed: C",exact=True)).to_be_visible()
    expect(page.get_by_alt_text("Stored project image C")).to_have_count(0)
    expect(page.get_by_role("button",name="Remove native thumbnail C")).to_have_count(0)
    expect(page.get_by_alt_text("Stored project image A")).to_be_visible()
    expect(page.get_by_alt_text("Stored project image B")).to_be_visible()
    print("NATIVE_THUMBNAIL_REMOVAL_PASS")
    source_dimensions=page.get_by_alt_text("Stored project image A").evaluate("(img) => [img.naturalWidth,img.naturalHeight]")
    page.get_by_role("button",name="1920×1080 Full HD",exact=False).click()
    expect(page.get_by_text("Native image saved: C",exact=True)).to_be_visible()
    page.wait_for_function("() => {const i=document.querySelector('img[alt=\"Stored project image C\"]');return i?.naturalWidth===1920 && i?.naturalHeight===1080}")
    assert page.get_by_alt_text("Stored project image A").evaluate("(img) => [img.naturalWidth,img.naturalHeight]")==source_dimensions
    print("NATIVE_THUMBNAIL_RESAMPLE_ISOLATION_PASS")
    from pathlib import Path
    for label,ext,width,height in [
        ("4K JPEG (3840×2160)","jpg",3840,2160),
        ("4K PNG (3840×2160)","png",3840,2160),
        ("720p JPEG (1280×720)","jpg",1280,720),
        ("720p PNG (1280×720)","png",1280,720),
    ]:
        with page.expect_download(timeout=60000) as exported:
            page.get_by_role("button",name=label,exact=True).click()
        download=exported.value
        assert download.failure() is None
        assert download.suggested_filename==f"thumbnail_{'4k' if width==3840 else '720p'}_{width}x{height}_C.{ext}"
        data=Path(download.path()).read_bytes()
        assert data.startswith(bytes.fromhex("89504e470d0a1a0a" if ext=="png" else "ffd8ff")), data[:8].hex()
        import base64
        mime="image/png" if ext=="png" else "image/jpeg"
        dimensions=page.evaluate("""async ({data,mime}) => {const img=new Image();img.src='data:'+mime+';base64,'+data;await img.decode();return [img.naturalWidth,img.naturalHeight]}""",{"data":base64.b64encode(data).decode(),"mime":mime})
        assert dimensions==[width,height],dimensions
        if width==1280 and ext=="jpg": assert len(data)<2_000_000,len(data)
        print("NATIVE_THUMBNAIL_EXPORT_PASS",ext,width,height,len(data))
    print("NATIVE_THUMBNAIL_EXPORT_ALL_FORMATS_PASS")
    page.get_by_role("button",name="Attach active thumbnail to project release").click()
    expect(page.get_by_text("Project release thumbnail saved",exact=True)).to_be_visible()
    release=page.get_by_alt_text("Stored project release thumbnail")
    expect(release).to_be_visible()
    page.wait_for_function("() => {const i=document.querySelector('img[alt=\"Stored project release thumbnail\"]');return i?.naturalWidth===3840 && i?.naturalHeight===2160}")
    print("PROJECT_RELEASE_ATTACHMENT_PASS")
    page.get_by_role("button",name="Remove native thumbnail C").click()
    expect(page.get_by_alt_text("Stored project image C")).to_have_count(0)
    page.get_by_label("Project image art",exact=True).set_input_files({"name":"art.png","mimeType":"image/png","buffer":png})
    expect(page.get_by_text("Project image saved: art",exact=True)).to_be_visible()
    page.evaluate("""() => {window.__auditEnabled=false;localStorage.setItem('aether_voice_settings','voice-fixture');localStorage.setItem('favorite_voices','favorites-fixture');localStorage.setItem('aether_thumb_abc_slots_v2','thumb-fixture');window.__auditEnabled=true;}""")
    page.get_by_role("button",name="Open native Voice Studio").click()
    expect(page.get_by_role("group",name="Native Voice Studio")).to_be_visible()
    expect(page.get_by_placeholder("sk_... (введите ElevenLabs API Key #1)")).to_be_disabled()
    expect(page.get_by_placeholder("sk_... (введите ElevenLabs API Key #2)")).to_be_disabled()
    page.locator("#voice_lang_select").select_option("English UK")
    page.locator("#voice_gender_select").select_option("female")
    page.get_by_role("button",name="Save project").click()
    expect(page.get_by_role("group",name="Native Voice Studio")).to_have_count(0)
    entries = page.evaluate('window.__storageAudit')
    assert all(e['area']=='local' and e['key'] in ('story-nexus.ui-language.v1','story-nexus.ui-navigation.v1') and e['method'] in ('getItem','setItem') for e in entries), [{"area":e["area"],"method":e["method"],"key":e["key"].split(":")[0]} for e in entries]
    page.reload()
    expect(page.get_by_role("button",name="Open isolated project editor")).to_be_visible()
    assert page.evaluate('window.__storageAudit.length') == 0
    page.get_by_role("button",name="Open isolated project editor").click()
    expect(page.get_by_label("VerbaFlow script")).to_have_value("Native history narration")
    page.get_by_role("button",name="Open native Voice Studio").click()
    expect(page.locator("#voice_lang_select")).to_have_value("English UK")
    expect(page.locator("#voice_gender_select")).to_have_value("female")
    page.get_by_role("button",name="Open native Image Art Editor").click()
    expect(page.get_by_role("group",name="Native Image Art Editor")).to_be_visible()
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_workspace_draft')}finally{window.__auditEnabled=true}}")=="legacy-fixture"
    expect(page.get_by_alt_text("Stored project image C")).to_have_count(0)
    expect(page.get_by_alt_text("Stored project image B")).to_be_visible()
    expect(page.get_by_alt_text("Stored project image art")).to_be_visible()
    print("NATIVE_THUMBNAIL_REMOVAL_RELOAD_PASS")
    expect(page.get_by_alt_text("Stored project release thumbnail")).to_be_visible()
    print("PROJECT_RELEASE_ATTACHMENT_RELOAD_PASS")
    page.get_by_role("button",name="Применить к Обложке A").click()
    expect(page.get_by_text("Native image saved: art, A",exact=True)).to_be_visible()
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_voice_settings')}finally{window.__auditEnabled=true}}")=="voice-fixture"
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('favorite_voices')}finally{window.__auditEnabled=true}}")=="favorites-fixture"
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('aether_thumb_abc_slots_v2')}finally{window.__auditEnabled=true}}")=="thumb-fixture"
    entries = page.evaluate('window.__storageAudit')
    assert all(e['area']=='local' and e['key'] in ('story-nexus.ui-language.v1','story-nexus.ui-navigation.v1') and e['method'] in ('getItem','setItem') for e in entries), [{"area":e["area"],"method":e["method"],"key":e["key"].split(":")[0]} for e in entries]
    assert page.evaluate("() => {window.__auditEnabled=false;try{return localStorage.getItem('ac_gh_token')==='synthetic-migration-fixture'}finally{window.__auditEnabled=true}}")
    print('ISOLATED_COLD_START_STORAGE_PASS')
    print('ISOLATED_PRODUCTION_STORAGE_ACCESS_PASS')
    # Independent legacy browser context, synthetic token only. No OAuth popup or external API calls.
    legacy = browser.new_page()
    legacy_errors = []
    legacy.on("pageerror", lambda error: legacy_errors.append(str(error).splitlines()[0][:160]))
    legacy.route("https://**/*", lambda route: route.abort())
    legacy.goto("http://127.0.0.1:8765/aethercombine-studio/?v9-project-preview=1")
    expect(legacy.get_by_role("button",name="Open legacy Studio")).to_be_visible()
    # Seed on the actual application origin, after the mode chooser has loaded.
    legacy.evaluate("""() => {
      sessionStorage.removeItem('aether_secrets_purged_v1');
      localStorage.setItem('ac_gh_token','synthetic-legacy-boot-token');
    }""")
    assert legacy.evaluate("localStorage.getItem('ac_gh_token')==='synthetic-legacy-boot-token'")
    legacy.get_by_role("button",name="Open legacy Studio").click()
    try:
        expect(legacy.locator("footer")).to_contain_text("AetherCombine Studio",timeout=10000)
        legacy.wait_for_function("""() => localStorage.getItem('ac_gh_token')===null && JSON.parse(sessionStorage.getItem('aether_github_token_session')||'{}').github_token==='synthetic-legacy-boot-token'""",timeout=10000)
    except Exception:
        print("LEGACY_BOOT_DIAGNOSTICS", legacy.evaluate("""() => ({
          sourcePresent:localStorage.getItem('ac_gh_token')!==null,
          destinationPresent:sessionStorage.getItem('aether_github_token_session')!==null,
          destinationMatches:JSON.parse(sessionStorage.getItem('aether_github_token_session')||'{}').github_token==='synthetic-legacy-boot-token',
          migrationFlag:sessionStorage.getItem('aether_secrets_purged_v1')==='1',
          footerPresent:!!document.querySelector('footer')
        })"""), "page_error_count",len(legacy_errors))
        raise
    print("LEGACY_BOOT_MIGRATION_PASS")
    legacy.close()
    browser.close()
    print("BROWSER_UI_ISOLATION_PASS")
