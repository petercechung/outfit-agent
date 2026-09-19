// Posting to 穿搭牆: choose and crop a photo, optionally cover the face, add details, give consent.
import { api } from "../shared/api.js";
import { createCropper } from "../shared/cropper.js";
import { icon } from "../shared/icons.js";
import { pickImageFile } from "../shared/images.js";
import { closeSheet, openSheet } from "../shared/sheet.js";
import { myPosts, profile, saveMyPosts, saveProfile } from "../shared/store.js";
import { $, BODY_TYPE_NAME, formatPrice, OCCASION_NAME, options, toast } from "../shared/ui.js";

let onPosted = () => {};

/** Called after a successful post (the feed uses it to refresh without importing this module's callers). */
export function setOnPosted(callback) {
  onPosted = callback;
}

export function openComposer({ items = [], occasion = null } = {}) {
  const purchasable = items.filter((i) => !i.owned);
  const ownedNames = items.filter((i) => i.owned).map((i) => i.name);
  const total = purchasable.reduce((sum, item) => sum + item.price, 0);
  let cropper = null;
  let submitting = false;

  const html = `
    <div class="cropper" id="cropper">
      <button class="cropper-empty" data-action="sheet" data-handler="pick">${icon("camera", 28)}<strong>選一張穿搭照</strong>
        <span class="muted">全身照最好；只拍脖子以下也可以</span></button>
    </div>
    <div id="cropControls" class="stack" hidden>
      <label class="field"><span class="label">縮放</span><input type="range" id="cropZoom" min="100" max="300" value="100"></label>
      <div class="button-row">
        <button class="btn btn-sm" id="coverButton" data-action="sheet" data-handler="cover" aria-pressed="false">${icon("eyeOff")}遮臉</button>
        <button class="btn btn-sm" data-action="sheet" data-handler="pick">${icon("camera")}換一張</button>
      </div>
      <label class="field" id="coverSizeField" hidden><span class="label">遮臉大小</span><input type="range" id="coverSize" min="50" max="200" value="100"></label>
      <p class="muted">拖曳照片調整位置。打開遮臉後，拖曳黑色方塊蓋住臉。</p>
    </div>
    <label class="field"><span class="label">說點什麼</span>
      <textarea class="textarea" id="postCaption" maxlength="140" placeholder="例如：158cm 穿 M 剛好，裙長到膝上"></textarea></label>
    <div class="form-grid">
      <label class="field"><span class="label">身高 (cm)</span>
        <input class="input" id="postHeight" type="number" inputmode="numeric" min="120" max="210" value="${profile.height_cm ?? ""}"></label>
      <label class="field"><span class="label">體型</span>
        <select class="select" id="postBody"><option value="">不提供</option>${options(BODY_TYPE_NAME, profile.body_type)}</select></label>
      <label class="field"><span class="label">場合</span>
        <select class="select" id="postOccasion"><option value="">不指定</option>${options(OCCASION_NAME, occasion)}</select></label>
    </div>
    ${purchasable.length ? `<div class="notice">會一起附上 ${purchasable.length} 件可購買單品（${formatPrice(total)}）${ownedNames.length ? `，以及你自己的 ${ownedNames.length} 件衣服` : ""}。</div>` : ""}
    <label class="check"><input type="checkbox" id="postConsent">
      <span>我同意這張照片公開顯示在穿搭牆，照片中的人也同意公開；我可以隨時在「我的」刪除。</span></label>
    <button class="btn btn-primary btn-block" id="postSubmit" data-action="sheet" data-handler="submit">${icon("upload")}發佈</button>`;

  async function submit() {
    if (submitting) return;
    if (!cropper) return toast("先選一張穿搭照");
    if (!$("#postConsent").checked) return toast("發文前需要勾選同意公開");
    const heightValue = $("#postHeight").value;
    const height = heightValue ? Number(heightValue) : null;
    const bodyType = $("#postBody").value || null;
    const button = $("#postSubmit");
    submitting = true;
    button.disabled = true;
    try {
      const caption = $("#postCaption").value.trim();
      const created = await api.feed.create({
        image: cropper.exportJpeg(), caption, height_cm: height, body_type: bodyType,
        occasion: $("#postOccasion").value || null, article_ids: purchasable.map((i) => i.article_id),
        owned_items: ownedNames, consent: true,
      });
      myPosts.unshift({ id: created.id, delete_token: created.delete_token, caption, created_at: Date.now() });
      saveMyPosts();
      if (!profile.height_cm && height) {
        profile.height_cm = height;
        profile.body_type ??= bodyType;
        saveProfile();
      }
      closeSheet();
      toast("已發佈到穿搭牆");
      onPosted(created.id);
    } catch (error) {
      toast(error.message);
      submitting = false;
      button.disabled = false;
    }
  }

  openSheet({
    title: "發佈到穿搭牆",
    html,
    handlers: {
      pick: async () => {
        const file = await pickImageFile();
        try {
          cropper?.destroy();
          cropper = await createCropper($("#cropper"), file);
          $("#cropControls").hidden = false;
          $("#cropZoom").value = "100";
        } catch (error) {
          toast(error.message);
        }
      },
      cover: (_, button) => {
        const shown = cropper?.toggleCover() ?? false;
        button.setAttribute("aria-pressed", String(shown));
        $("#coverSizeField").hidden = !shown;
      },
      submit: () => submit(),
    },
    onOpen: (body) => body.addEventListener("input", (event) => {
      if (event.target.id === "cropZoom") cropper?.setZoom(Number(event.target.value) / 100);
      if (event.target.id === "coverSize") cropper?.setCoverSize(Number(event.target.value) / 100);
    }),
    onClose: () => cropper?.destroy(),
  });
}
