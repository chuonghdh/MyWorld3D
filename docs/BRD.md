# MyWorld3D – BRD v1.1 (Phase 1: Foundation)

## 1. Mục tiêu
Mô phỏng thành phố 3D nhìn từ trên cao, có nhà cửa, xe cộ, cây xanh, ngày đêm, mây, gió. Phase 1 là khung chạy được, làm nền để mở rộng thành game/simulation.

## 2. Phạm vi Phase 1

### 2.1 Scene & camera
- Nhìn từ trên cao, orbit / pan / zoom.
- Chế độ Tilt-shift (hậu kỳ làm mờ nền kiểu mô hình thu nhỏ).
- Whole map: căn camera để thấy toàn bộ thành phố.

### 2.2 Sinh thành phố (procedural)
- Sinh theo `seed` và tham số: đường, lưới block, lô đất, khối nhà, cây đường phố.
- Quy mô trung bình: vài trăm nhà (mục tiêu ~300–400).
- Kiến trúc theo hướng Tây Âu: kiểu nhà, dãy nhà và đường phố đều mang phong cách châu Âu.
- Mỗi block có một loại: **block of houses** hoặc **block of monument**.

### 2.3 Block monument (10 loại)
Các công trình châu Âu, tự dựng procedural đơn giản:
Hospital, Stadium, Funfair, Swimming pool, Dinosaur park, Supermarket, Open-air theatre, Circus, Fire station, và một công trình châu Âu thay cho One Pillar Pagoda (**tạm chọn nhà thờ kiểu Gothic**; bạn có thể đổi).

### 2.4 Nhà (house)
- 9 preset kiểu nhà: As the block has it, Original (Feuilles), Canal house (Amsterdam), Glass tower, Brutalist concrete, Bauhaus, Mediterranean, Brownstone (New York), Nordic timber, Shophouse (Asia).
  - Lưu ý: các preset nhà Châu Á/Shophouse vẫn nằm trong danh sách vì bạn chọn "tất cả 9 preset"; nếu muốn đồng nhất Tây Âu thì báo lại.
- Mỗi preset có nút **Classic / Modern**.
- Thuộc tính: số tầng (2–8), kiểu mái (Mansard, Flat, Gable, Hip, Cornice, Parapet, Terrace, Low tiled, Step gable...), màu tường, màu cửa chớp, nút New look và Original (hoàn tác về gốc).

### 2.5 Cây đô thị (4 loại, bộ châu Âu/Mỹ)
- 4 loài rụng lá, đổi màu theo mùa.
- Mùa: Xuân xanh, Hạ xanh đậm, Thu đỏ vàng, Đông trụi lá.
- Thuộc tính: loài, số lượng (Street trees ×), kích thước lá (Leaf size), tỉ lệ lá (Leaves %).
- Nút **Switch trees**: đổi loài cây hàng loạt.

### 2.6 Panel cấu hình
- **Settings – City:** Light (golden hour → dusk), Season, Wind (tốc độ m/s, hướng la bàn), Town width/depth, Traffic & people (×), Street trees (×), Leaves %, Leaf size. Nút: Gust, Leaf devil, Sound, Music, Tilt-shift, Switch trees, Whole map, Move blocks, Reset blocks, Reset houses.
- **House panel:** như mục 2.4.
- **Monument block panel:** chọn công trình trong 10 loại.
- Click chọn nhà / block / cây → hiện bảng thuộc tính tương ứng.

### 2.7 Chỉnh sửa
- Kéo thả để hoán đổi vị trí hai block hoặc hai nhà.
- Undo / Redo (Ctrl+Z / Ctrl+Y) cho thao tác kéo thả và đổi thuộc tính.
- Lưu / tải layout ra file JSON.

### 2.8 Ngày đêm, mây, gió
- Chu kỳ ngày đêm điều khiển bằng slider; đèn đường và cửa sổ bật khi tối.
- Mây trôi chậm.
- **Gust:** cơn gió giả lập, tăng gió tạm thời.
- **Leaf devil:** cuốn lá xoáy ngẫu nhiên trên đường.
- Gió làm cây và lá đung đưa (shader vertex); gió mạnh cuốn lá rơi theo.

### 2.9 Âm thanh (làm đủ nhóm)
- **Xào xạc lá:** cường độ theo tốc độ gió.
- **Xe:** tiếng động cơ theo loại xe (xe con, xe buýt, xe tải, xe máy).
- **Còi xe:** ngẫu nhiên, thỉnh thoảng.
- **Người đi bộ:** tiếng lao xao nói chuyện nhỏ, nền nhẹ.
- **Chó sủa:** ngẫu nhiên từ người đi bộ dắt chó.
- Có nút **Sound** (bật/tắt toàn bộ) và **Music** (placeholder phase 1).
- Lưu ý: trình duyệt chặn autoplay, âm thanh chỉ bật sau khi người dùng click lần đầu.

### 2.10 Giao thông & người đi bộ
- Xe con, xe buýt, xe tải, xe máy chạy theo waypoint trên làn đường. Chưa tránh va chạm.
- Đèn tín hiệu theo chu kỳ cố định tại giao lộ.
- Người đi bộ trên vỉa hè, có chó (dắt theo).

## 3. Yêu cầu phi chức năng
- Chrome / Edge desktop.
- Mục tiêu ~30 fps với 300–400 nhà trên laptop thông thường.
- Dùng `InstancedMesh` và gộp geometry để giảm draw call.
- UI và code đều tiếng Anh.

## 4. Công nghệ
- TypeScript, Vite, Three.js, React + React Three Fiber.
- `@react-three/drei` (helper: OrbitControls, Sky, Cloud...).
- `zustand` (state layout và setting).
- `suncalc` (vị trí mặt trời theo giờ).
- `three-mesh-bvh` (nếu click chọn chậm).
- `vitest` (test logic sinh thành phố).
- Web Audio API (âm thanh procedural, không cần file audio ngoài phase 1).

## 5. Ngoài phạm vi Phase 1
- Dữ liệu OSM thật.
- Xe tránh va chạm và AI giao thông phức tạp (phase 2).
- Multiplayer, mobile, lưu đám mây.
- Nhạc nền (Music chỉ là placeholder).

## 6. Tiêu chí nghiệm thu
1. Cùng seed cho cùng thành phố.
2. Mọi slider trong setting đổi scene ngay.
3. Chọn được nhà / block / cây và sửa thuộc tính.
4. Hoán đổi được hai block hoặc nhà bằng kéo thả; Undo/Redo hoạt động.
5. Lưu JSON rồi tải lại ra đúng layout.
6. Ngày đêm, mây, gió, lá cây và cuốn lá hoạt động.
7. Âm thanh xào xạc tăng theo gió; có nút Sound bật/tắt.
8. Xe, đèn tín hiệu và người đi bộ hoạt động; không lỗi trong console.
9. Đạt mục tiêu fps trên máy thông thường.

## 7. Giả định (có thể đổi)
- Cây đô thị: Maple (Phong), Oak (Sồi), Birch (Bạch dương), Ginkgo (Bạch quả) – bộ châu Âu/Mỹ.
- Monument thay Pagoda: nhà thờ kiểu Gothic.
- Git: `git init` local, chưa commit cho đến khi được yêu cầu.
