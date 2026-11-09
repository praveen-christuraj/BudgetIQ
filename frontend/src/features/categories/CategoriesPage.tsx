import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormDialog } from '@/components/common/FormDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { categoriesApi } from '@/services/endpoints';
import type { Category } from '@/types';
import { invalidateFinancialData } from '@/utils/invalidate';

export function CategoriesPage() {
  const { isAdmin } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#607D8B');
  const [subcategories, setSubcategories] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [addingTo, setAddingTo] = useState<Category | null>(null);
  const [newSubcategory, setNewSubcategory] = useState('');

  const { data: categories = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => categoriesApi.list(undefined, true),
  });

  const visible = categories.filter((category) => category.kind === tab);

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? categoriesApi.update(editing.id, { name: name.trim(), color })
        : categoriesApi.create({
            name: name.trim(),
            kind: tab,
            color,
            subcategories: subcategories
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setEditing(null);
      notify(editing ? 'Category updated' : 'Category created');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setDeleting(null);
      notify(result.message);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const addSubcategoryMutation = useMutation({
    mutationFn: () => categoriesApi.addSubcategory(addingTo!.id, newSubcategory.trim()),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setAddingTo(null);
      setNewSubcategory('');
      notify('Subcategory added');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const removeSubcategoryMutation = useMutation({
    mutationFn: ({ categoryId, subcategoryId }: { categoryId: string; subcategoryId: string }) =>
      categoriesApi.removeSubcategory(categoryId, subcategoryId),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      notify('Subcategory removed');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setName('');
    setColor(tab === 'income' ? '#2E7D32' : '#EF6C00');
    setSubcategories('');
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setColor(category.color);
    setSubcategories('');
    setFormError(null);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Consistent categories make budgets and reports meaningful. Only administrators can change them."
        actions={
          isAdmin && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
              Add category
            </Button>
          )
        }
      />

      <Card>
        <Tabs value={tab} onChange={(_event, value: 'expense' | 'income') => setTab(value)} sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab value="expense" label={`Expense categories (${categories.filter((c) => c.kind === 'expense').length})`} />
          <Tab value="income" label={`Income categories (${categories.filter((c) => c.kind === 'income').length})`} />
        </Tabs>

        {isLoading ? (
          <LoadingBlock label="Loading categories…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load categories'} onRetry={() => void refetch()} />
        ) : visible.length ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Subcategories</TableCell>
                  <TableCell>Status</TableCell>
                  {isAdmin && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((category) => (
                  <TableRow key={category.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: category.color }} />
                        <Typography variant="body2" fontWeight={600}>
                          {category.name}
                        </Typography>
                        {category.is_system && <Chip size="small" variant="outlined" label="Default" sx={{ height: 18, fontSize: '0.6rem' }} />}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {category.subcategories.length ? (
                          category.subcategories.map((subcategory) => (
                            <Chip
                              key={subcategory.id}
                              size="small"
                              label={subcategory.name}
                              variant="outlined"
                              onDelete={
                                isAdmin
                                  ? () =>
                                      removeSubcategoryMutation.mutate({
                                        categoryId: category.id,
                                        subcategoryId: subcategory.id,
                                      })
                                  : undefined
                              }
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No subcategories
                          </Typography>
                        )}
                        {isAdmin && (
                          <Tooltip title="Add subcategory">
                            <IconButton size="small" onClick={() => setAddingTo(category)} aria-label="Add subcategory">
                              <AddCircleOutlineRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={category.is_active ? 'success' : 'error'} label={category.is_active ? 'Active' : 'Inactive'} sx={{ height: 22, fontSize: '0.7rem' }} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(category)} aria-label="Edit category">
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete or deactivate">
                          <IconButton size="small" color="error" onClick={() => setDeleting(category)} aria-label="Delete category">
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState title="No categories yet" description="Create categories to classify income and expenses." icon={<CategoryRoundedIcon fontSize="inherit" />} />
        )}
      </Card>

      <FormDialog
        open={dialogOpen}
        title={editing ? `Edit ${editing.name}` : `Add ${tab} category`}
        submitLabel={editing ? 'Save changes' : 'Create category'}
        loading={saveMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={() => {
          if (name.trim().length < 1) {
            setFormError('Category name is required.');
            return;
          }
          saveMutation.mutate();
        }}
      >
        {formError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formError}
          </Alert>
        )}
        <Stack spacing={2}>
          <TextField label="Category name" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextField label="Colour" type="color" value={color} onChange={(event) => setColor(event.target.value)} sx={{ maxWidth: 160 }} />
          {!editing && (
            <TextField
              label="Subcategories"
              value={subcategories}
              onChange={(event) => setSubcategories(event.target.value)}
              placeholder="Vegetables, Household supplies"
              helperText="Optional, comma separated."
            />
          )}
        </Stack>
      </FormDialog>

      <Dialog open={Boolean(addingTo)} onClose={() => setAddingTo(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add subcategory to {addingTo?.name}</DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Subcategory name" value={newSubcategory} onChange={(event) => setNewSubcategory(event.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddingTo(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!newSubcategory.trim() || addSubcategoryMutation.isPending}
            onClick={() => addSubcategoryMutation.mutate()}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove this category?"
        description={
          deleting
            ? `"${deleting.name}" will be deleted if unused. Categories used by transactions are deactivated instead so history stays intact.`
            : ''
        }
        confirmLabel="Remove category"
        tone="error"
        loading={deleteMutation.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </>
  );
}
