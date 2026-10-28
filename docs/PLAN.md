# MyWorld3D – Kế hoạch agent

Tổng cộng 6 vai trò. Agent 0 làm trước, 4 agent (1–4) chạy song song sau khi khung xong, agent 5 làm cuối.

| # | Vai trò | Phạm vi file (file ownership) | Phụ thuộc |
|---|---|---|---|
| 0 | Scaffold | `package.json`, `vite.config.ts`, `tsconfig*.json`, `src/main.tsx`, `src/App.tsx`, `src/core/*` (types, seed RNG) | – |
| 1 | City generator | `src/city/*` (đường, lưới block, lô đất, cây đường phố, waypoint xe) | 0 |
| 2 | Building & monument | `src/buildings/*` (preset nhà, mái, Classic/Modern, 10 block-monument) | 0 |
| 3 | Environment | `src/environment/*` (sky, mặt trời, mây, gió, shader cây/lá, lá cuốn) | 0 |
| 4 | UI, state & audio | `src/ui/*`, `src/store/*`, `src/audio/*` (panel, zustand, JSON, undo/redo, Web Audio) | 0 |
| 5 | Traffic & QA | `src/traffic/*`, `tests/*` (xe, đèn tín hiệu, người đi bộ; test; kiểm tra fps/console) | 1, 2, 3, 4 |

## Quy tắc khi chạy song song
- Mỗi agent chỉ sửa file trong phạm vi của mình. Cần đổi file khác thì báo lại thay vì tự sửa.
- Kiểu dữ liệu chung (`src/core/types.ts`) do agent 0 định nghĩa trước. Các agent khác chỉ thêm, không đổi tên trường đã có.
- Store (`src/store`) là nguồn duy nhất cho layout và setting. Scene chỉ đọc từ store.

## Thứ tự
1. Agent 0: scaffold, build được, scene trống có camera top-down.
2. Agent 1–4: chạy song song.
3. Agent 5: tích hợp traffic, test, kiểm tra build và console.
