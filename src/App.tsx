import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Bootstrap } from './app/Bootstrap'
import { AppShell } from './app/AppShell'
import { WeekPlanPage } from './features/plan/WeekPlanPage'
import { ServePage } from './features/plan/ServePage'
import { ReadyPage } from './features/ready/ReadyPage'
import { RecipesPage } from './features/recipes/RecipesPage'
import { RecipeDetailPage } from './features/recipes/RecipeDetailPage'
import { RecipeEditPage } from './features/recipes/RecipeEditPage'
import { PantryPage } from './features/pantry/PantryPage'
import { MorePage } from './features/more/MorePage'
import { IngredientsPage } from './features/ingredients/IngredientsPage'
import { ShoppingPage } from './features/shopping/ShoppingPage'
import { CookLogPage } from './features/log/CookLogPage'
import { GoalsPage } from './features/goals/GoalsPage'
import { BackupPage } from './features/backup/BackupPage'
import { NotebookPage } from './features/notebook/NotebookPage'
import { SessionPlanPage } from './features/cook/SessionPlanPage'
import { CookPage } from './features/cook/CookPage'

export default function App() {
  return (
    <Bootstrap>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<WeekPlanPage />} />
            <Route path="serve" element={<ServePage />} />
            <Route path="ready" element={<ReadyPage />} />
            <Route path="recipes" element={<RecipesPage />} />
            <Route path="recipes/new" element={<RecipeEditPage />} />
            <Route path="recipes/:id" element={<RecipeDetailPage />} />
            <Route path="recipes/:id/edit" element={<RecipeEditPage />} />
            <Route path="pantry" element={<PantryPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="ingredients" element={<IngredientsPage />} />
            <Route path="shopping" element={<ShoppingPage />} />
            <Route path="log" element={<CookLogPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="notebook" element={<NotebookPage />} />
            <Route path="sessions/new" element={<SessionPlanPage />} />
            <Route path="cook/:id" element={<CookPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Bootstrap>
  )
}
